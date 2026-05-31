const { z } = require('zod');

const addCropSchema = z.object({
  name: z.string().min(2, "Crop name is too short").max(100, "Crop name is too long"),
  category: z.enum(['Vegetables', 'Fruits', 'Grains', 'Pulses', 'Spices', 'Others'], {
    errorMap: () => ({ message: "Invalid category selected" })
  }),
  quantity: z.number().positive("Quantity must be greater than 0"),
  unit: z.enum(['Kg', 'Quintal', 'Ton'], {
    errorMap: () => ({ message: "Invalid unit selected" })
  }),
  price: z.number().nonnegative("Price cannot be negative"),
  harvestDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Invalid harvest date format"
  }),
  description: z.string().max(500, "Description is too long").optional(),
  variety: z.string().optional(),
  location: z.string().min(2, "Location is required"),
  farmingMethod: z.enum(['Organic', 'Conventional', 'Hydroponic'], { errorMap: () => ({ message: "Invalid farming method" }) }),
  qualityGrade: z.enum(['Grade A', 'Grade B', 'Grade C'], { errorMap: () => ({ message: "Invalid quality grade" }) }),
  minOrderQuantity: z.number().positive("Minimum order quantity must be greater than 0"),
  logisticsOption: z.enum(['Self-Pickup', 'Transport Available'], { errorMap: () => ({ message: "Invalid logistics option" }) }),
  availabilityStatus: z.enum(['Ready to Dispatch', 'Pre-Booking'], { errorMap: () => ({ message: "Invalid availability status" }) }),
  paymentTerms: z.enum(['100% Advance', '50% Advance', 'Cash on Delivery'], { errorMap: () => ({ message: "Invalid payment terms" }) }),
  images: z.array(z.string()).max(4, "You can upload a maximum of 4 images").optional()
});

module.exports = {
  addCropSchema
};
