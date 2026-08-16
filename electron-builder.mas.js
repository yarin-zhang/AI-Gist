const baseConfig = require('./electron-builder.json');

module.exports = {
  ...baseConfig,
  mac: {
    ...baseConfig.mac,
    target: 'mas',
    // electron-builder's universal packer invokes the ordinary macOS signing
    // hook before the final MAS signing pass. Skip that Developer ID pass.
    identity: null
  },
  mas: {
    ...baseConfig.mas,
    identity: 'YANLIN ZHANG (9T93J5B7N6)'
  }
};
