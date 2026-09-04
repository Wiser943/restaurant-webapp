# Mama Tolu's Kitchen — restaurant app

One simple project. No React, no Next.js, no build step — just:
- **Node.js** (the server)
- **Express** (handles web requests)
- **MongoDB** (the database)
- **Plain HTML, CSS, and JavaScript** (the website and admin dashboard — the kind you can open and read directly)

Everything runs as **one program**. When you start it, it does three things at once:
1. Talks to your MongoDB database
2. Answers API requests (login, menu, cart, orders...)
3. Serves the actual website pages (the ones your customers see, and the admin pages)

## Folder structure (matches what you asked for)

```
restaurant-app/
├── server/          <- the Node.js backend (API + database logic)
│   ├── server.js    <- the ONE file you run to start everything
│   ├── config/      <- database + real-time (socket) setup
│   ├── controllers/ <- the actual logic for each feature
│   ├── models/      <- what's stored in MongoDB (User, MenuItem, Order, etc.)
│   ├── routes/      <- which web address triggers which controller
│   ├── middleware/  <- login-checking, error handling
│   └── utils/
├── public/          <- the CUSTOMER-facing website (plain HTML/CSS/JS)
│   ├── index.html   <- home page (the menu)
│   ├── item.html    <- a single dish's page
│   ├── cart.html, checkout.html, orders.html, order.html
│   ├── login.html, signup.html, account.html, favorites.html
│   ├── css/style.css
│   ├── js/          <- one .js file per page, plus shared api.js and nav.js
│   └── manifest.json, sw.js, icons/  <- what makes it installable as an "app"
├── admin/           <- the ADMIN dashboard (also plain HTML/CSS/JS)
│   ├── index.html   <- approve/reject orders
│   ├── menu.html    <- add/edit/remove dishes, toggle "ready to order"
│   └── settings.html <- your bank account details + banners/ads
├── package.json     <- the ONE list of dependencies for the whole project
└── .env.example     <- copy this to .env and fill in your real values
```

## How it works, in plain terms

- **Every HTML page is just a normal web page.** Open `public/index.html` in a text editor and you'll see regular HTML. No compiling, no "build" step.
- **Every page talks to the server using `fetch()`** (in the `.js` files) — this is how the page asks for the menu, logs someone in, places an order, etc. The server answers with JSON.
- **MongoDB stores everything**: menu items, users, orders, banners, your bank account details.
- **Socket.io** pushes live updates — when you (the admin) approve an order or change a price, the customer's page updates itself instantly, no refresh needed.
- **No payment gateway.** Checkout shows your bank account number. The customer transfers manually and submits the order. You (admin) check your bank app and click "Approve" — only then does the customer see "Order confirmed."

## Running it on your own computer

1. Install [Node.js](https://nodejs.org) if you don't have it.
2. Install [MongoDB](https://www.mongodb.com/try/download/community) locally, OR create a free database at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) (easier — no local install).
3. In the `restaurant-app` folder, run:
   ```
   npm install
   ```
4. Copy `.env.example` to `.env` and fill in:
   - `MONGO_URI` — your database connection string
   - `JWT_SECRET` — any long random string (this signs login sessions)
5. Start it:
   ```
   npm run dev
   ```
6. Open your browser to `http://localhost:5000` — that's your website.
   Go to `http://localhost:5000/admin` for the admin dashboard.

## Making yourself an admin

There's no public "become admin" button (for obvious safety reasons). After you sign up normally through the website:
1. Open your MongoDB database (Atlas has a "Browse Collections" button, or use MongoDB Compass)
2. Find your user in the `users` collection
3. Change `"role": "customer"` to `"role": "admin"`
4. Log out and back in — you'll now see the "Admin" button and `/admin` will work for you

## Deploying to Render (so it's live on the internet)

1. Push this whole `restaurant-app` folder to a GitHub repository.
2. On [Render](https://render.com), click **New → Web Service**, connect your GitHub repo.
3. Set:
   - **Build command:** `npm install`
   - **Start command:** `npm start`
4. Under **Environment**, add the same variables from your `.env` file:
   - `MONGO_URI` (use MongoDB Atlas, since Render doesn't host MongoDB itself — Atlas has a free tier)
   - `JWT_SECRET`
   - `NODE_ENV` = `production`
5. Deploy. Render gives you a live web address like `https://your-app.onrender.com` — that address IS your whole app: website, admin dashboard, and API all together, since it's all one program.

That's it — one deploy, one address, no separate frontend hosting to manage.

## Turning it into a phone "app"

Because this is a normal responsive website, the simplest path is:

- **On the phone's browser** (Chrome/Safari), visit your Render address, then use "Add to Home Screen." Because of the `manifest.json` and `sw.js` files already included, it installs like a real app icon and opens full-screen — no browser bar.
- **If you want it in the Play Store / App Store specifically**, you can wrap the exact same live website using **Capacitor** later — it just loads your Render URL inside a native shell. That's a separate small project on top of this one; ask me when you're ready and I'll set that up too.

## What's not included yet

- Actual product photo uploads (right now you paste an image URL when adding a menu item — you'd host images somewhere like Cloudinary/imgbb and paste the link)
- Email/SMS notifications when an order status changes
- Multiple admin accounts with different permission levels

Everything else — live menu updates, price-change badges, favorites, cart, bank-transfer checkout, and the order-approval workflow — is fully working.
