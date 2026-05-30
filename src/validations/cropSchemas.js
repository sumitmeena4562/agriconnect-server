const { z } = require('zod');

const addCropSchema = z.object({
  body: z.object({
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
    images: z.array(z.string()).max(3, "You can upload a maximum of 3 images").optional()
  })
});

module.exports = {
  addCropSchema
};
