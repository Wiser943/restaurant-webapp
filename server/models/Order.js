const mongoose = require('mongoose');

const orderExtraSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1, default: 1 },
  },
  { _id: false }
);

const orderItemSchema = new mongoose.Schema(
  {
    menuItem: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem', required: true },
    name: { type: String, required: true }, // snapshot, in case the item is later renamed/removed
    price: { type: Number, required: true }, // snapshot at time of order
    quantity: { type: Number, required: true, min: 1 },
    extras: [orderExtraSchema], // add-ons selected for this line, e.g. extra Kpomo
  },
  { _id: false }
);

// Everything about HOW an order gets from the kitchen to the customer -
// populated at checkout by the proximity/quote logic in deliveryController,
// then kept up to date by the Chowdeck webhook if it's a Relay delivery.
const deliverySchema = new mongoose.Schema(
  {
    mode: { type: String, enum: ['IN_HOUSE', 'CHOWDECK_RELAY'], default: 'IN_HOUSE' },

    // Customer's checkout-time coordinates (HTML5 Geolocation) and the
    // straight-line distance from the restaurant, computed server-side.
    customerLocation: {
      lat: { type: Number },
      lng: { type: Number },
    },
    distanceKm: { type: Number },

    // What the customer is actually charged for delivery. ₦0 for IN_HOUSE;
    // for CHOWDECK_RELAY this is the exact rider fare from Chowdeck's quote,
    // passed straight through with no markup.
    fee: { type: Number, default: 0 },

    // Our own estimate, since Chowdeck's quote endpoint has no live timer.
    etaMinutes: { type: Number },
    etaAt: { type: Date },

    // Only populated once this order is routed through Chowdeck Relay.
    chowdeck: {
      feeId: { type: Number }, // from the /relay/delivery/fee quote
      deliveryReference: { type: String, index: true }, // our reference sent to Chowdeck
      deliveryId: { type: Number }, // Chowdeck's internal delivery id
      trackingUrl: { type: String },
      riderName: { type: String },
      riderPhone: { type: String },
      status: { type: String }, // raw Chowdeck status, e.g. "picked", "arrived"
      friendlyStatus: { type: String }, // customer-facing text, set by the webhook handler
      lastWebhookAt: { type: Date },
      lastWebhookCategory: { type: String }, // e.g. "ORDER_PICKED_UP"
    },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    delivery: { type: deliverySchema, default: () => ({}) },

    // Short, human-friendly ID (e.g. "MT-260902-8F3K1A") shown to the customer
    // and used to look the order up in support chat / admin search. The Mongo
    // _id still exists underneath but is no longer what people read out loud.
    orderNumber: { type: String, unique: true, index: true },

    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    items: [orderItemSchema],
    totalAmount: { type: Number, required: true },

    // Snapshot of the total at the moment the order was placed, before any
    // admin price adjustment. If this is set and differs from totalAmount,
    // the customer is shown "was X, now Y" plus the reason below.
    originalTotalAmount: { type: Number },
    priceAdjustmentReason: { type: String },

    // Only "approved" here should ever be shown to the customer as "successful"
    paymentStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    paymentReference: { type: String }, // gateway reference (Paystack/Flutterwave) if used
    paymentMethod: { type: String, default: 'unspecified' },

    orderStatus: {
      type: String,
      enum: ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'completed', 'cancelled'],
      default: 'pending',
    },

    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // which admin approved/rejected
    reviewedAt: { type: Date },
    rejectionReason: { type: String },

    // Delivery / supplier tracking
    assignedSupplier: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    estimatedDeliveryAt: { type: Date }, // set when admin/supplier starts delivery
    dispatchedAt: { type: Date },
    deliveredAt: { type: Date },
    deliveryIssue: { type: String }, // set if the supplier reports a problem

    deliveryAddress: { type: String },
    // Free-text extra detail the customer added at checkout (e.g. "no onions
    // please, and can you add extra suya spice?"). Admins see this while
    // reviewing the order and can adjust totalAmount if it changes the price.
    notes: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Order', orderSchema);
