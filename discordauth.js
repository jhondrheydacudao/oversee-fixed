const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const User = require('../models/user'); // Adjust the path as needed
const express = require('express');
const router = express.Router();

// Configure the Discord strategy for use by Passport.
passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: "http://yourdomain.com/auth/discord/callback",
    scope: ['identify', 'email']
  },
  function(accessToken, refreshToken, profile, done) {
    User.findOrCreate({ discordId: profile.id }, function (err, user) {
      return done(err, user);
    });
  }
));

// Serialize user into the sessions
passport.serializeUser(function(user, done) {
    done(null, user.id);
});

// Deserialize user from the sessions
passport.deserializeUser(function(id, done) {
    User.findById(id, function(err, user) {
        done(err, user);
    });
});

// Redirect to Discord for authentication
router.get('/auth/discord', passport.authenticate('discord'));

// Handle the callback after Discord has authenticated the user
router.get('/auth/discord/callback',
  passport.authenticate('discord', { failureRedirect: '/login' }),
  function(req, res) {
    // Successful authentication, redirect home.
    res.redirect('/');
  });

module.exports = router;
