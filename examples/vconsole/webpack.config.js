module.exports = {
  entry: './interface.js',
  output: {
    path: __dirname,
    filename: 'interface.bundle.js'
  },
  module: {
    loaders: [
      {test: /\.less$/, loader: 'style!css!less!'}
    ]
  }
};
