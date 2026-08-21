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
    // MAS builds must NOT enable the hardened runtime (keep hardenedRuntime
    // false in electron-builder.json's "mas" block). Electron's V8 needs JIT
    // memory; a hardened-runtime signature without com.apple.security.cs.allow-jit
    // makes the app crash instantly on launch (EXC_BREAKPOINT in
    // v8::Isolate::Initialize) — this is what broke the 2.0.3 App Store build.
    // App Sandbox, not hardened runtime, is what the Mac App Store requires.
    identity: 'YANLIN ZHANG (9T93J5B7N6)'
  }
};
