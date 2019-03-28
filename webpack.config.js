const path = require('path');

module.exports = {
  entry: {
    'mutation-summary': './src/mutation-summary.ts',
    'tree-mirror': './src/util/tree-mirror.ts',
    'test/tests': './test/tests.ts'
  },
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'dist'),
    libraryTarget: 'global',
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/
      },
      {
        test: /\.html$/,
        use: {
          loader: 'file-loader',
          options: {
            name: 'test/[name].[ext]'
          }
        }
      },
    ],
  },
  resolve: {
    extensions: [ '.tsx', '.ts', '.js' ]
  }
};
