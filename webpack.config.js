const path = require('path');
const fs = require('fs');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { ModuleFederationPlugin } = require('webpack').container;

const REMOTE_ENTRY_FILENAME = 'remoteEntry.[contenthash:8].js';

class FederationManifestPlugin {
  apply(compiler) {
    compiler.hooks.afterEmit.tap('FederationManifestPlugin', (compilation) => {
      const entry = [...compilation.entrypoints.get('ofFederatedApp')?.getFiles() || []]
        .find(f => f.startsWith('remoteEntry.'));
      const manifest = {
        name: 'ofFederatedApp',
        remoteEntry: entry,
        timestamp: new Date().toISOString(),
      };
      fs.writeFileSync(
        path.resolve(compiler.outputPath, 'federation-manifest.json'),
        JSON.stringify(manifest, null, 2)
      );
    });
  }
}

module.exports = {
  entry: './src/index',
  mode: 'production',
  output: {
    path: path.resolve(__dirname, 'dist'),
    publicPath: 'https://gkuhlmann-arine.github.io/of-federated-app/',
    uniqueName: 'ofFederatedApp',
    clean: true,
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.jsx'],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'ts-loader',
          options: {
            transpileOnly: true,
          },
        },
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  plugins: [
    new ModuleFederationPlugin({
      name: 'ofFederatedApp',
      filename: REMOTE_ENTRY_FILENAME,
      exposes: {
        './App': './src/App',
      },
      shared: {
        react: { singleton: true, eager: false, requiredVersion: '^18.2.0' },
        'react-dom': { singleton: true, eager: false, requiredVersion: '^18.2.0' },
      },
    }),
    new HtmlWebpackPlugin({
      template: './public/index.html',
    }),
    new FederationManifestPlugin(),
  ],
};
