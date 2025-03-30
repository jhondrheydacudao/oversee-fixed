const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const express = require('express');
const router = express.Router();

// Configure the Discord strategy for use by Passport.
passport.use(new DiscordStrategy({
    clientID: 1355707227419185266,
    clientSecret: SoJCGfOH1iy7EunihWc0Z74EdaY-P6Pr,
    callbackURL: "https://discord.com/oauth2/authorize?client_id=1355707227419185266&response_type=code&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Fdiscord%2Fcallback&scope=identify+email",
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
