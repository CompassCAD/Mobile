const { getDefaultConfig } = require('expo/metro-config')
const config = getDefaultConfig(__dirname)

const { assetExts, sourceExts } = config.resolver

// Route .svg files through the transformer instead of treating them as images
config.transformer.babelTransformerPath = require.resolve('react-native-svg-transformer/expo')
config.resolver.assetExts = assetExts.filter((ext) => ext !== 'svg')
config.resolver.sourceExts = [...sourceExts, 'svg']

// FontoBene fonts (Derakuma) ship as bundled assets
config.resolver.assetExts.push('bene')

module.exports = config