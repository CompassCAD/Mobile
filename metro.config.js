const { getDefaultConfig } = require('expo/metro-config')
const config = getDefaultConfig(__dirname)
// FontoBene fonts (Derakuma) ship as bundled assets
config.resolver.assetExts.push('bene')
module.exports = config
