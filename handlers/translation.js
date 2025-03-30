const path = require('path');
const fs = require('fs');

/**
 * Load translations from the specified language file.
 * Falls back to English if the specified language file does not exist.
 * @param {string} lang - The language code.
 * @returns {object} The translations object.
 */
function loadTranslations(lang) {
  const filePath = path.join(__dirname, `../lang/${lang}/lang.json`);
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    // Fallback to English if the language file does not exist
    return JSON.parse(fs.readFileSync(path.join(__dirname, '../lang/en/lang.json'), 'utf8'));
  } catch (error) {
    console.error(`Error loading translations: ${error.message}`);
    return {};
  }
}

/**
 * Middleware to add translations to the request object.
 * @param {object} req - The request object.
 * @param {object} res - The response object.
 * @param {function} next - The next middleware function.
 */
function translationMiddleware(req, res, next) {
  req.lang = (req.cookies && req.cookies.lang) ? req.cookies.lang : 'en';
  req.translations = loadTranslations(req.lang);
  next();
}

module.exports = translationMiddleware;
