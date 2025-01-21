const path = require('path');
require("dotenv").config();

module.exports = {
  entry: './src/script.js',
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'public', 'dist'),
  },
  mode: 'development',
  resolve: {
    alias: {
      // This is where npm packages are resolved for client-side usage
      'alchemy-sdk': path.resolve(__dirname, 'node_modules/alchemy-sdk')
    }
  },
  plugins: [
    // Use the DefinePlugin to inject environment variables into the code
    new (require('webpack')).DefinePlugin({
      'process.env.ALCHEMY_API_KEY': JSON.stringify(process.env.ALCHEMY_API_KEY),
    }),
  ],
  module: {
    rules: [
      {
        test: /\.js$/,          // Use Babel for JS files
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env'],
          },
        },
      },
    ],
  },
  devServer: {
    contentBase: path.resolve(__dirname, 'public'),  // Serve static files from public folder
    hot: true,  // Enable hot module replacement for better dev experience
    port: 3000,  // Port to run the dev server
  },
};