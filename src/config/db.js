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

const VehicleType = require('../models/VehicleType');

const seedVehicleTypes = async () => {
    try {
        const count = await VehicleType.countDocuments();
        if (count > 0) {
            console.log('VehicleTypes already seeded.'.green.bold);
            return;
        }

        const vehicleTypes = [
            {
                vehicleName: "Bike Delivery",
                vehicleCategory: "Two Wheeler",
                capacityKg: 30,
                maxOrders: 5,
                fuelType: ["Petrol", "Electric"],
                dimensions: { length: "2 m", width: "0.8 m", height: "1.2 m" },
                useCase: "Last Mile Customer Delivery",
                requiredDocuments: ["RC", "Insurance", "PUC", "Driving License"]
            },
            {
                vehicleName: "Electric Cargo Scooter",
                vehicleCategory: "Electric Vehicle",
                capacityKg: 50,
                maxOrders: 8,
                fuelType: ["Electric"],
                batteryRange: "80-120 KM",
                dimensions: { length: "2.1 m", width: "0.9 m", height: "1.3 m" },
                useCase: "Urban Vegetable Delivery",
                requiredDocuments: ["RC", "Insurance"]
            },
            {
                vehicleName: "Cargo Auto Rickshaw",
                vehicleCategory: "Three Wheeler",
                capacityKg: 500,
                maxOrders: 15,
                fuelType: ["Petrol", "CNG"],
                dimensions: { length: "3 m", width: "1.5 m", height: "1.8 m" },
                useCase: "Local Farmer Pickup",
                requiredDocuments: ["RC", "Insurance", "PUC", "Commercial Permit"]
            },
            {
                vehicleName: "Mahindra Jeeto",
                vehicleCategory: "Mini Commercial Vehicle",
                capacityKg: 600,
                maxOrders: 20,
                fuelType: ["Diesel"],
                dimensions: { length: "3.3 m", width: "1.5 m", height: "1.7 m" },
                useCase: "Village Collection",
                requiredDocuments: ["RC", "Insurance", "Fitness Certificate", "Permit"]
            },
            {
                vehicleName: "Tata Ace",
                vehicleCategory: "Mini Truck",
                capacityKg: 750,
                maxOrders: 25,
                fuelType: ["Diesel", "CNG", "Electric"],
                dimensions: { length: "3.8 m", width: "1.5 m", height: "1.8 m" },
                useCase: "Farmer to Vendor Transportation",
                requiredDocuments: ["RC", "Insurance", "PUC", "Fitness Certificate", "Permit"]
            },
            {
                vehicleName: "Tata Intra V30",
                vehicleCategory: "Pickup Truck",
                capacityKg: 1300,
                maxOrders: 35,
                fuelType: ["Diesel"],
                dimensions: { length: "4.5 m", width: "1.7 m", height: "1.9 m" },
                useCase: "Inter City Delivery",
                requiredDocuments: ["RC", "Insurance", "Fitness Certificate", "Permit"]
            },
            {
                vehicleName: "Bolero Pickup",
                vehicleCategory: "Pickup Truck",
                capacityKg: 1500,
                maxOrders: 40,
                fuelType: ["Diesel"],
                dimensions: { length: "5 m", width: "1.8 m", height: "1.9 m" },
                useCase: "Batch Deliveries",
                requiredDocuments: ["RC", "Insurance", "Fitness Certificate", "Permit"]
            },
            {
                vehicleName: "Ashok Leyland Dost",
                vehicleCategory: "Light Commercial Vehicle",
                capacityKg: 1500,
                maxOrders: 45,
                fuelType: ["Diesel"],
                dimensions: { length: "4.6 m", width: "1.8 m", height: "2 m" },
                useCase: "Vendor Transportation",
                requiredDocuments: ["RC", "Insurance", "Fitness Certificate", "Permit"]
            },
            {
                vehicleName: "Tractor Trolley",
                vehicleCategory: "Agricultural Vehicle",
                capacityKg: 5000,
                maxOrders: 100,
                fuelType: ["Diesel"],
                dimensions: { length: "6 m", width: "2.2 m", height: "2.5 m" },
                useCase: "Farm Produce Collection",
                requiredDocuments: ["RC", "Insurance"]
            },
            {
                vehicleName: "Refrigerated Van",
                vehicleCategory: "Cold Chain Vehicle",
                capacityKg: 3000,
                maxOrders: 80,
                fuelType: ["Diesel"],
                temperatureRange: "2°C - 8°C",
                dimensions: { length: "6 m", width: "2.3 m", height: "2.6 m" },
                useCase: "Fruits, Milk and Perishable Products",
                requiredDocuments: ["RC", "Insurance", "Fitness Certificate", "Cold Chain Permit"]
            },
            {
                vehicleName: "Eicher Container Truck",
                vehicleCategory: "Heavy Commercial Vehicle",
                capacityKg: 10000,
                maxOrders: 200,
                fuelType: ["Diesel"],
                dimensions: { length: "10 m", width: "2.5 m", height: "3.5 m" },
                useCase: "Warehouse and Bulk Transportation",
                requiredDocuments: ["RC", "Insurance", "Fitness Certificate", "National Permit"]
            }
        ];

        await VehicleType.insertMany(vehicleTypes);
        console.log('VehicleTypes seeded successfully! 🚀'.green.bold);
    } catch (error) {
        console.error('Error seeding VehicleTypes:'.red, error);
    }
};

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log(`MongoDB Connected: ${conn.connection.host}`.cyan.underline.bold);
        await seedVehicleTypes();
    } catch (error) {
        console.error(`Error: ${error.message}`.red.underline.bold);
        process.exit(1);
    }
};

module.exports = connectDB;
