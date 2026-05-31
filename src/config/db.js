const mongoose = require('mongoose');
const colors = require('colors');
const { requestStore } = require('../middleware/logger');

// Global plugin to track database operations in the request context
mongoose.plugin((schema) => {
  // 1. Regular queries (find, delete, count, aggregate)
  schema.pre(['find', 'findOne', 'findOneAndDelete', 'deleteOne', 'deleteMany', 'countDocuments', 'aggregate'], function() {
    this._startTime = process.hrtime();
  });

  schema.post(['find', 'findOne', 'findOneAndDelete', 'deleteOne', 'deleteMany', 'countDocuments', 'aggregate'], function(res) {
    const logContext = requestStore.getStore();
    if (logContext) {
      const diff = this._startTime ? process.hrtime(this._startTime) : [0, 0];
      const durationMs = diff[0] * 1000 + diff[1] / 1000000;
      
      let collection = 'Unknown';
      if (this.model) {
        collection = this.model.modelName;
      } else if (this.modelName) {
        collection = this.modelName;
      } else if (typeof this.model === 'function') {
        collection = this.model().modelName;
      }

      logContext.database.push({
        collection,
        operation: this.op || 'aggregate',
        query: this.getQuery ? this.getQuery() : (this._pipeline || {}),
        durationMs,
        response: res
      });
    }
  });

  // 2. Document saves (creates and updates via save)
  schema.pre('save', function() {
    this._startTime = process.hrtime();
  });

  schema.post('save', function(doc) {
    const logContext = requestStore.getStore();
    if (logContext) {
      const diff = this._startTime ? process.hrtime(this._startTime) : [0, 0];
      const durationMs = diff[0] * 1000 + diff[1] / 1000000;
      
      logContext.database.push({
        collection: this.constructor.modelName || 'Unknown',
        operation: 'save',
        query: { _id: this._id },
        data: this.toObject(),
        durationMs,
        response: doc
      });
    }
  });

  // 3. Update operations (captures document before and after state)
  schema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], async function() {
    this._startTime = process.hrtime();
    const logContext = requestStore.getStore();
    if (logContext) {
      try {
        const query = this.getQuery();
        this._docBefore = await this.model.findOne(query).lean();
      } catch (err) {
        // Ignore to prevent logging logic from throwing errors
      }
    }
  });

  schema.post(['findOneAndUpdate', 'updateOne', 'updateMany'], async function(res) {
    const logContext = requestStore.getStore();
    if (logContext) {
      const diff = this._startTime ? process.hrtime(this._startTime) : [0, 0];
      const durationMs = diff[0] * 1000 + diff[1] / 1000000;
      
      let docAfter = null;
      try {
        const query = this.getQuery();
        docAfter = await this.model.findOne(query).lean();
      } catch (err) {
        // Ignore
      }

      logContext.database.push({
        collection: this.model ? this.model.modelName : 'Unknown',
        operation: this.op,
        query: this.getQuery(),
        data: this.getUpdate ? this.getUpdate() : undefined,
        docBefore: this._docBefore || null,
        docAfter: docAfter || null,
        durationMs,
        response: res
      });
    }
  });
});

// Configure Mongoose debug hooks
mongoose.set('debug', (collectionName, method, query, doc, options) => {
  const logContext = requestStore.getStore();
  if (!logContext) {
    // Log startup/non-request queries directly to terminal using debug hook
    console.log(`[Mongoose Global Debug] ${collectionName}.${method}`.cyan.bold);
    console.log(`Query: ${JSON.stringify(query)}`.gray);
  }
});

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log(`MongoDB Connected: ${conn.connection.host}`.cyan.underline.bold);
    } catch (error) {
        console.error(`Error: ${error.message}`.red.underline.bold);
        process.exit(1);
    }
};

module.exports = connectDB;
