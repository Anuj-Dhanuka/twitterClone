const express = require("express");
const app = express();

app.use(express.json());

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const path = require("path");
const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const checkUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const isUserExists = await db.get(checkUserQuery);
  const hashedPassword = await bcrypt.hash(password, 10);

  if (isUserExists === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const addUserQuery = `
        INSERT INTO user(username, password, name, gender)
        VALUES (
            '${username}',
            '${hashedPassword}',
            '${name}',
            '${gender}'
        );
        `;
      await db.run(addUserQuery);
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const userDetails = await db.get(getUserQuery);
  if (userDetails === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatch = await bcrypt.compare(
      password,
      userDetails.password
    );
    if (isPasswordMatch === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

const authenticateJwtToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;

        next();
      }
    });
  }
};

app.get(
  "/user/tweets/feed/",
  authenticateJwtToken,
  async (request, response) => {
    const { username } = request;
    const getUserQuery = `
    SELECT *
    from user
    WHERE username = '${username}';
    `;
    const loginUser = await db.get(getUserQuery);

    const getFollowingUsersQuery = `
    SELECT 
        username,
        tweet,
        date_time AS dateTIME

    FROM (user INNER JOIN follower
        ON follower.following_user_id = user.user_id) AS T 
        INNER JOIN tweet ON T.following_user_id = tweet.user_id
    WHERE user.user_id = ${loginUser.user_id}
    

    ;
    `;

    const followingArray = await db.all(getFollowingUsersQuery);
    response.send(followingArray);
  }
);

app.get("/user/following/", authenticateJwtToken, async (request, response) => {
  const { username } = request;
  const getUserQuery = `
    SELECT *
    from user
    WHERE username = '${username}';
    `;
  const loginUser = await db.get(getUserQuery);

  const getFollowingQuery = `
    SELECT name
    FROM user INNER JOIN follower
     ON user.user_id = follower.following_user_id
    WHERE follower.follower_user_id = ${loginUser.user_id}; `;
  const followersArray = await db.all(getFollowingQuery);
  response.send(followersArray);
});

app.get("/user/followers/", authenticateJwtToken, async (request, response) => {
  const { username } = request;
  const getUserQuery = `
  SELECT *
  FROM user 
  WHERE username = '${username}';
  `;
  const userDetails = await db.get(getUserQuery);

  const getFollowersQuery = `
  SELECT name
  FROM user INNER JOIN follower
    ON user.user_id = follower.follower_user_id
 WHERE follower.following_user_id = ${userDetails.user_id};   
  `;

  const followersArray = await db.all(getFollowersQuery);
  response.send(followersArray);
});

app.get(
  "/tweets/:tweetId/",
  authenticateJwtToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const getTweetQuery = `
  SELECT *
  FROM tweet
  WHERE tweet_id = ${tweetId};
  `;
    const requestedTweet = await db.get(getTweetQuery);

    const getUserQuery = `
   SELECT *
   FROM user 
   WHERE username = '${username}'; 
   `;
    const userDetails = await db.get(getUserQuery);

    const getFollowerQuery = `
    SELECT *
    FROM follower
    WHERE follower_user_id = ${userDetails.user_id} 
     AND following_user_id = ${requestedTweet.user_id};
    `;

    const isFollowing = await db.get(getFollowerQuery);
    console.log(isFollowing);

    if (isFollowing !== undefined) {
      const getTweetAndReplyQuery = `
        SELECT 
            tweet,
            SUM(like_id) AS likes,
            SUM(reply) AS replies,
            date_time AS dateTime
        FROM (tweet NATURAL JOIN reply) AS T 
            NATURAL JOIN like
        WHERE tweet.tweet_id = ${tweetId}
        `;
      const dbResponse = await db.all(getTweetAndReplyQuery);
      response.send(dbResponse);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

app.get(
  "/tweets/:tweetId/likes/",
  authenticateJwtToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const getTweetQuery = `
  SELECT *
  FROM tweet
  WHERE tweet_id = ${tweetId};
  `;
    const requestedTweet = await db.get(getTweetQuery);

    const getUserQuery = `
   SELECT *
   FROM user 
   WHERE username = '${username}'; 
   `;
    const userDetails = await db.get(getUserQuery);

    const getFollowerQuery = `
    SELECT *
    FROM follower
    WHERE follower_user_id = ${userDetails.user_id} 
     AND following_user_id = ${requestedTweet.user_id};
    `;

    const isFollowing = await db.get(getFollowerQuery);
    console.log(isFollowing);

    if (isFollowing === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getLikerQuery = `
        SELECT username
        FROM user INNER JOIN like 
            ON user.user_id = like.user_id
        WHERE like.tweet_id = ${tweetId};    
        `;
      const likersArray = await db.all(getLikerQuery);
      let allLikers = [];
      let likersList = likersArray.map((eachLike) => {
        allLikers.push(eachLike.username);
      });
      response.send({ likes: allLikers });
    }
  }
);

app.get(
  "/tweets/:tweetId/replies/",
  authenticateJwtToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const getTweetQuery = `
  SELECT *
  FROM tweet
  WHERE tweet_id = ${tweetId};
  `;
    const requestedTweet = await db.get(getTweetQuery);

    const getUserQuery = `
   SELECT *
   FROM user 
   WHERE username = '${username}'; 
   `;
    const userDetails = await db.get(getUserQuery);

    const getFollowerQuery = `
    SELECT *
    FROM follower
    WHERE follower_user_id = ${userDetails.user_id} 
     AND following_user_id = ${requestedTweet.user_id};
    `;

    const isFollowing = await db.get(getFollowerQuery);
    console.log(isFollowing);

    if (isFollowing === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getRepliesQuery = `
        SELECT name, reply
        FROM user INNER JOIN reply
            ON user.user_id	 = reply.user_id
        WHERE reply.tweet_id = ${tweetId}    
        `;
      const repliers = await db.all(getRepliesQuery);
      response.send({ replies: repliers });
    }
  }
);

app.get("/user/tweets/", authenticateJwtToken, async (request, response) => {
  const { username } = request;
  const getUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const userDetails = await db.get(getUserQuery);

  const getTweetQuery = `
  SELECT tweet,
    SUM(like_id) AS likes,
    SUM(reply) AS replies,
    date_time AS dateTime
  FROM (tweet INNER JOIN reply 
    ON tweet.tweet_id = reply.tweet_id) AS T 
    INNER JOIN like
    ON T.tweet_id = like.tweet_id
  WHERE tweet.user_id = ${userDetails.user_id}
  GROUP BY tweet.tweet_id;
  `;
  const tweets = await db.all(getTweetQuery);
  response.send(tweets);
});

app.post("/user/tweets/", authenticateJwtToken, async (request, response) => {
  const { tweet } = request.body;
  const { username } = request;
  const getUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const userDetails = await db.get(getUserQuery);
  let dateTime = new Date();
  let currentDateTime = `${dateTime.getFullYear()}-${dateTime.getMonth()}-${dateTime.getDay()} ${dateTime.getHours()}:${dateTime.getMinutes()}:${dateTime.getSeconds()}`;
  const postTweetQuery = `
    INSERT INTO 
        tweet(tweet, user_id, date_time)
        VALUES(
            '${tweet}',
            ${userDetails.user_id},
            '${currentDateTime}'
        );
    `;
  const postTweet = await db.run(postTweetQuery);
  response.send("Created a Tweet");
});

app.delete(
  "/tweets/:tweetId/",
  authenticateJwtToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const getUserQuery = `
   SELECT *
   FROM user 
   WHERE username = '${username}'; 
   `;
    const userDetails = await db.get(getUserQuery);

    const getTweetQuery = `
  SELECT *
  FROM tweet
  WHERE tweet_id = ${tweetId};
  `;
    const requestedTweet = await db.get(getTweetQuery);

    if (requestedTweet.user_id === userDetails.user_id) {
      const deleteTweetQuery = `
    DELETE FROM tweet 
    WHERE tweet_id = ${tweetId};
    `;
      const deletedTweet = await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);
module.exports = app;
