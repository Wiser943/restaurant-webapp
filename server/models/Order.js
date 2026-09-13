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

    // How the customer intends to pay. "pay_on_delivery" is only offered at
    // checkout when the delivery resolves to IN_HOUSE (i.e. the customer is
    // close by) and still needs an admin's explicit sign-off (reviewStatus
    // below) before the order is allowed to move to "preparing".
    paymentMethod: {
      type: String,
      enum: ['bank_transfer', 'pay_on_delivery'],
      default: 'bank_transfer',
    },

    // The FIRST admin gate: has anyone actually looked at this order and its
    // price yet? Nothing (bank details, "preparing" status, etc.) is shown
    // to the customer until an admin stamps this "approved" — that's the
    // "admin should see it, whether to adjust price or press the stamp" step.
    reviewStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },

    // The SECOND gate, only relevant for paymentMethod: "bank_transfer":
    //  pending               - not reviewed yet, nothing shown to customer
    //  awaiting_payment      - admin stamped it; customer can now see the
    //                          account details and pay
    //  proof_submitted       - customer uploaded (or skipped) a screenshot
    //                          and says they've sent the transfer
    //  approved              - admin confirmed the money actually landed
    //  rejected              - admin could not verify the payment
    //  not_required          - pay_on_delivery orders that passed review skip
    //                          straight here, no payment screen needed
    // Only "approved" or "not_required" mean the order can be "preparing".
    paymentStatus: {
      type: String,
      enum: ['pending', 'awaiting_payment', 'proof_submitted', 'approved', 'rejected', 'not_required'],
      default: 'pending',
    },
    paymentReference: { type: String }, // transfer note / bank reference the customer typed in
    // Link to the transaction-screenshot the customer optionally uploaded to
    // ImgBB from the order page, so the admin can visually confirm payment.
    paymentProofUrl: { type: String },
    paymentSubmittedAt: { type: Date }, // when the customer marked payment as sent

    orderStatus: {
      type: String,
      enum: ['pending', 'awaiting_payment', 'preparing', 'out_for_delivery', 'completed', 'cancelled'],
      default: 'pending',
    },

    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // admin who stamped/rejected the order itself
    reviewedAt: { type: Date },
    paymentReviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // admin who confirmed/rejected the payment
    paymentReviewedAt: { type: Date },
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
