'use strict';

var siteConfig = require('../data/site-config.json');

module.exports = {
  CLOUD_FUNCTIONS_BASE: String(siteConfig.cloudFunctionsBaseUrl || '').replace(/\/$/, ''),
};
