/* ------------------------------------------------------------------
   Front Belt — category catalogue, seed data, shared lists

   Every listing belongs to one of six categories. Each category has
   its own icon, accent colour and set of types, and only Health
   carries the daily status / wait-time fields — the rest are found
   by where they are and how far they are.

   Coordinates for sample entries are the CENTRE of each Nairobi
   area, so distance search can be tried before real listings are
   added. They are NOT real businesses. Real listings carry their
   own latitude and longitude, captured in the consoles.
-------------------------------------------------------------------*/
window.FB_DATA = {
  nairobi: { lat: -1.2864, lng: 36.8172 },

  areas: [
    "CBD", "Donholm", "Embakasi", "Karen", "Kasarani", "Kawangware", "Kibera",
    "Kilimani", "Kileleshwa", "Langata", "Lavington", "Madaraka", "Muthaiga",
    "Ngara", "Parklands", "Ruiru", "South B", "South C", "Westlands", "Zimmerman"
  ],

  /* health only — the other categories show type, hours and distance instead */
  services: [
    "General outpatient", "Maternal and child health", "Dental", "Laboratory",
    "Pharmacy", "Optical", "Physiotherapy", "Vaccination", "Family planning",
    "Minor surgery", "Radiology", "Mental health"
  ],

  levels: ["Listed", "Verified", "Trusted", "Certified"],

  /* The six categories shown on the home page. `health` is the one that
     carries wait time and today's status; everything else is location,
     distance and directions. */
  categories: [
    {
      id: "health", label: "Health", tag: "Clinics, pharmacies, dental and labs",
      icon: "i-clinic", color: "#E8135F", health: true,
      types: ["Clinic", "Pharmacy", "Hospital", "Dental clinic", "Laboratory", "Physiotherapy", "Optical"]
    },
    {
      id: "food", label: "Food", tag: "Bakeries, pizza, chicken and restaurants",
      icon: "i-food", color: "#E8590C", health: false,
      types: ["Bakery", "Pizza", "Chicken", "Restaurant", "Café", "Fast food", "Butchery"]
    },
    {
      id: "beauty", label: "Beauty", tag: "Salons, kinyozi, spa and nails",
      icon: "i-beauty", color: "#7E22CE", health: false,
      types: ["Salon", "Kinyozi", "Spa", "Nail parlour", "Barber", "Makeup studio"]
    },
    {
      id: "tech", label: "Tech & Money", tag: "Phones, electricals, Airtel and M-Pesa agents",
      icon: "i-tech", color: "#1D4ED8", health: false,
      types: ["Phone shop", "Electrical shop", "Phone accessories", "Airtel agent", "M-Pesa agent", "Airtime & bundles"]
    },
    {
      id: "books", label: "Books", tag: "Bookshops, libraries and stationery",
      icon: "i-books", color: "#0F766E", health: false,
      types: ["Bookshop", "Library", "Stationery", "Printing & photocopy"]
    },
    {
      id: "home", label: "Home & Living", tag: "Furniture, showrooms and home items",
      icon: "i-home2", color: "#B45309", health: false,
      types: ["Furniture store", "Showroom", "Home décor", "Kitchenware", "Bedding & linen", "Hardware"]
    }
  ],

  /* minutesAgo: how long since a health listing last confirmed its status,
     so the "not updated / status unknown / hidden" rules can be seen. */
  clinics: [
    /* ---------------- Health ---------------- */
    { id: "s1", category: "health", type: "Clinic", name: "Sample Family Clinic", area: "Kilimani", address: "Sample address, Kilimani", lat: -1.2921, lng: 36.7836, phone: "+254 700 000 001", trust: "Verified", status: "open", waitMinutes: 20, busy: 55, minutesAgo: 45, services: ["General outpatient", "Laboratory"], hours: "Mon–Sat 8:00–18:00", sample: true },
    { id: "s2", category: "health", type: "Clinic", name: "Sample Community Medical Centre", area: "Westlands", address: "Sample address, Westlands", lat: -1.2649, lng: 36.8043, phone: "+254 700 000 002", trust: "Trusted", status: "open", waitMinutes: 35, busy: 80, minutesAgo: 90, services: ["General outpatient", "Maternal and child health", "Pharmacy"], hours: "Mon–Sun 7:00–20:00", sample: true },
    { id: "s3", category: "health", type: "Pharmacy", name: "Sample Health Point", area: "South B", address: "Sample address, South B", lat: -1.3072, lng: 36.8329, phone: "+254 700 000 003", trust: "Listed", status: "open", waitMinutes: 15, busy: 30, minutesAgo: 2900, services: ["Pharmacy"], hours: "Mon–Fri 8:00–17:00", sample: true },
    { id: "s4", category: "health", type: "Clinic", name: "Sample Women's and Child Clinic", area: "Lavington", address: "Sample address, Lavington", lat: -1.2764, lng: 36.7686, phone: "+254 700 000 004", trust: "Verified", status: "open", waitMinutes: 10, busy: 25, minutesAgo: 25, services: ["Maternal and child health", "Family planning", "Vaccination"], hours: "Mon–Sat 8:00–17:00", sample: true },
    { id: "s5", category: "health", type: "Dental clinic", name: "Sample Dental and Medical Clinic", area: "Kilimani", address: "Sample address, Kilimani", lat: -1.2966, lng: 36.7852, phone: "+254 700 000 005", trust: "Listed", status: "closed", waitMinutes: null, busy: 0, minutesAgo: 120, services: ["Dental", "General outpatient"], hours: "Mon–Fri 9:00–18:00", sample: true },
    { id: "s6", category: "health", type: "Clinic", name: "Sample Eastlands Clinic", area: "Donholm", address: "Sample address, Donholm", lat: -1.2894, lng: 36.8933, phone: "+254 700 000 006", trust: "Verified", status: "open", waitMinutes: 25, busy: 60, minutesAgo: 60, services: ["General outpatient", "Pharmacy", "Laboratory"], hours: "Mon–Sun 8:00–20:00", sample: true },
    { id: "s7", category: "health", type: "Clinic", name: "Sample Parklands Medical", area: "Parklands", address: "Sample address, Parklands", lat: -1.2622, lng: 36.8163, phone: "+254 700 000 007", trust: "Trusted", status: "open", waitMinutes: 15, busy: 40, minutesAgo: 35, services: ["General outpatient", "Optical", "Laboratory"], hours: "Mon–Sat 8:00–19:00", sample: true },
    { id: "s8", category: "health", type: "Clinic", name: "Sample Karen Health Centre", area: "Karen", address: "Sample address, Karen", lat: -1.3350, lng: 36.7100, phone: "+254 700 000 008", trust: "Listed", status: "open", waitMinutes: 5, busy: 15, minutesAgo: 6000, services: ["General outpatient", "Physiotherapy"], hours: "Mon–Fri 8:30–17:00", sample: true },

    /* ---------------- Food ---------------- */
    { id: "f1", category: "food", type: "Bakery", name: "Sample Sunrise Bakery", area: "Kilimani", address: "Sample address, Kilimani", lat: -1.2921, lng: 36.7836, phone: "+254 700 000 011", trust: "Listed", hours: "Mon–Sat 6:00–20:00", services: ["Fresh bread", "Cakes", "Pastries"], sample: true },
    { id: "f2", category: "food", type: "Restaurant", name: "Sample Mama Njeri Kitchen", area: "Westlands", address: "Sample address, Westlands", lat: -1.2649, lng: 36.8043, phone: "+254 700 000 012", trust: "Listed", hours: "Mon–Sun 7:00–22:00", services: ["Kenyan meals", "Takeaway", "Lunch buffet"], sample: true },
    { id: "f3", category: "food", type: "Pizza", name: "Sample Pizza Corner", area: "CBD", address: "Sample address, CBD", lat: -1.2864, lng: 36.8172, phone: "+254 700 000 013", trust: "Listed", hours: "Mon–Sun 10:00–23:00", services: ["Pizza", "Fries", "Delivery"], sample: true },
    { id: "f4", category: "food", type: "Chicken", name: "Sample Chicken Hub", area: "Kasarani", address: "Sample address, Kasarani", lat: -1.2250, lng: 36.8900, phone: "+254 700 000 014", trust: "Listed", hours: "Mon–Sun 9:00–22:00", services: ["Grilled chicken", "Family buckets"], sample: true },

    /* ---------------- Beauty ---------------- */
    { id: "b1", category: "beauty", type: "Salon", name: "Sample Glow Beauty Salon", area: "Kilimani", address: "Sample address, Kilimani", lat: -1.2921, lng: 36.7836, phone: "+254 700 000 021", trust: "Listed", hours: "Tue–Sun 9:00–19:00", services: ["Hair", "Braids", "Facials"], sample: true },
    { id: "b2", category: "beauty", type: "Kinyozi", name: "Sample Kinyozi Express", area: "Kawangware", address: "Sample address, Kawangware", lat: -1.2780, lng: 36.7480, phone: "+254 700 000 022", trust: "Listed", hours: "Mon–Sat 8:00–20:00", services: ["Haircuts", "Beard trim"], sample: true },
    { id: "b3", category: "beauty", type: "Spa", name: "Sample Serenity Spa", area: "Karen", address: "Sample address, Karen", lat: -1.3350, lng: 36.7100, phone: "+254 700 000 023", trust: "Listed", hours: "Mon–Sun 10:00–18:00", services: ["Massage", "Body scrub"], sample: true },
    { id: "b4", category: "beauty", type: "Nail parlour", name: "Sample Tips & Toes Nails", area: "Westlands", address: "Sample address, Westlands", lat: -1.2649, lng: 36.8043, phone: "+254 700 000 024", trust: "Listed", hours: "Mon–Sat 9:00–19:00", services: ["Manicure", "Pedicure", "Gel polish"], sample: true },

    /* ---------------- Tech & Money ---------------- */
    { id: "t1", category: "tech", type: "Phone shop", name: "Sample TechHub Phones", area: "CBD", address: "Sample address, CBD", lat: -1.2864, lng: 36.8172, phone: "+254 700 000 031", trust: "Listed", hours: "Mon–Sat 8:30–19:00", services: ["New phones", "Repairs", "Trade-in"], sample: true },
    { id: "t2", category: "tech", type: "M-Pesa agent", name: "Sample M-Pesa Agent 001", area: "Kasarani", address: "Sample address, Kasarani", lat: -1.2250, lng: 36.8900, phone: "+254 700 000 032", trust: "Listed", hours: "Mon–Sat 7:00–20:00", services: ["Withdraw", "Deposit", "Buy airtime"], sample: true },
    { id: "t3", category: "tech", type: "Electrical shop", name: "Sample Volt Electricals", area: "Donholm", address: "Sample address, Donholm", lat: -1.2894, lng: 36.8933, phone: "+254 700 000 033", trust: "Listed", hours: "Mon–Sat 8:00–18:00", services: ["Wiring", "Fittings", "Solar"], sample: true },
    { id: "t4", category: "tech", type: "Airtel agent", name: "Sample Airtel Agent 014", area: "South B", address: "Sample address, South B", lat: -1.3072, lng: 36.8329, phone: "+254 700 000 034", trust: "Listed", hours: "Mon–Sat 8:00–19:00", services: ["SIM registration", "Airtime", "Bundles"], sample: true },

    /* ---------------- Books ---------------- */
    { id: "k1", category: "books", type: "Bookshop", name: "Sample Page Turners Bookshop", area: "Westlands", address: "Sample address, Westlands", lat: -1.2649, lng: 36.8043, phone: "+254 700 000 041", trust: "Listed", hours: "Mon–Sat 8:30–18:30", services: ["School books", "Novels", "Gifts"], sample: true },
    { id: "k2", category: "books", type: "Library", name: "Sample Community Library", area: "CBD", address: "Sample address, CBD", lat: -1.2864, lng: 36.8172, phone: "+254 700 000 042", trust: "Listed", hours: "Mon–Sat 9:00–17:00", services: ["Reading room", "Wi-Fi", "Children's corner"], sample: true },
    { id: "k3", category: "books", type: "Stationery", name: "Sample Sharp Stationers", area: "South B", address: "Sample address, South B", lat: -1.3072, lng: 36.8329, phone: "+254 700 000 043", trust: "Listed", hours: "Mon–Sat 8:00–18:00", services: ["Exercise books", "Printing", "Lamination"], sample: true },

    /* ---------------- Home & Living ---------------- */
    { id: "h1", category: "home", type: "Furniture store", name: "Sample Home Comfort Furniture", area: "Karen", address: "Sample address, Karen", lat: -1.3350, lng: 36.7100, phone: "+254 700 000 051", trust: "Listed", hours: "Mon–Sat 9:00–18:00", services: ["Sofas", "Beds", "Dining sets"], sample: true },
    { id: "h2", category: "home", type: "Showroom", name: "Sample Showroom 54", area: "Lavington", address: "Sample address, Lavington", lat: -1.2764, lng: 36.7686, phone: "+254 700 000 052", trust: "Listed", hours: "Mon–Sat 10:00–18:00", services: ["Home showroom", "Decor", "Lighting"], sample: true },
    { id: "h3", category: "home", type: "Kitchenware", name: "Sample Kitchen & Table", area: "Kilimani", address: "Sample address, Kilimani", lat: -1.2921, lng: 36.7836, phone: "+254 700 000 053", trust: "Listed", hours: "Mon–Sat 9:00–19:00", services: ["Cookware", "Crockery", "Storage"], sample: true },
    { id: "h4", category: "home", type: "Hardware", name: "Sample Builders Hardware", area: "Ruiru", address: "Sample address, Ruiru", lat: -1.2167, lng: 36.9500, phone: "+254 700 000 054", trust: "Listed", hours: "Mon–Sat 7:30–18:30", services: ["Paint", "Timber", "Tools"], sample: true }
  ]
};
