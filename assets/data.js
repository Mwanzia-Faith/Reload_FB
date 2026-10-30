/* ------------------------------------------------------------------
   Front Belt — seed data
   Coordinates are the CENTRE of each Nairobi area, so distance search
   can be tried before real clinics are added. They are NOT real
   clinics. Real listings carry their own latitude and longitude,
   captured in the team console or the provider console.
-------------------------------------------------------------------*/
window.FB_DATA = {
  nairobi: { lat: -1.2864, lng: 36.8172 },

  areas: [
    "CBD", "Donholm", "Embakasi", "Karen", "Kasarani", "Kawangware", "Kibera",
    "Kilimani", "Kileleshwa", "Langata", "Lavington", "Madaraka", "Muthaiga",
    "Ngara", "Parklands", "Ruiru", "South B", "South C", "Westlands", "Zimmerman"
  ],

  services: [
    "General outpatient", "Maternal and child health", "Dental", "Laboratory",
    "Pharmacy", "Optical", "Physiotherapy", "Vaccination", "Family planning",
    "Minor surgery", "Radiology", "Mental health"
  ],

  levels: ["Listed", "Verified", "Trusted", "Certified"],

  /* minutesAgo: how long since that clinic last confirmed its status,
     so the "not updated / status unknown / hidden" rules can be seen. */
  clinics: [
    { id: "s1", name: "Sample Family Clinic", area: "Kilimani", address: "Sample address, Kilimani", lat: -1.2921, lng: 36.7836, phone: "+254 700 000 001", trust: "Verified", status: "open", waitMinutes: 20, busy: 55, minutesAgo: 45, services: ["General outpatient", "Laboratory"], hours: "Mon–Sat 8:00–18:00", sample: true },
    { id: "s2", name: "Sample Community Medical Centre", area: "Westlands", address: "Sample address, Westlands", lat: -1.2649, lng: 36.8043, phone: "+254 700 000 002", trust: "Trusted", status: "open", waitMinutes: 35, busy: 80, minutesAgo: 90, services: ["General outpatient", "Maternal and child health", "Pharmacy"], hours: "Mon–Sun 7:00–20:00", sample: true },
    { id: "s3", name: "Sample Health Point", area: "South B", address: "Sample address, South B", lat: -1.3072, lng: 36.8329, phone: "+254 700 000 003", trust: "Listed", status: "open", waitMinutes: 15, busy: 30, minutesAgo: 2900, services: ["General outpatient"], hours: "Mon–Fri 8:00–17:00", sample: true },
    { id: "s4", name: "Sample Women's and Child Clinic", area: "Lavington", address: "Sample address, Lavington", lat: -1.2764, lng: 36.7686, phone: "+254 700 000 004", trust: "Verified", status: "open", waitMinutes: 10, busy: 25, minutesAgo: 25, services: ["Maternal and child health", "Family planning", "Vaccination"], hours: "Mon–Sat 8:00–17:00", sample: true },
    { id: "s5", name: "Sample Dental and Medical Clinic", area: "Kilimani", address: "Sample address, Kilimani", lat: -1.2966, lng: 36.7852, phone: "+254 700 000 005", trust: "Listed", status: "closed", waitMinutes: null, busy: 0, minutesAgo: 120, services: ["Dental", "General outpatient"], hours: "Mon–Fri 9:00–18:00", sample: true },
    { id: "s6", name: "Sample Eastlands Clinic", area: "Donholm", address: "Sample address, Donholm", lat: -1.2894, lng: 36.8933, phone: "+254 700 000 006", trust: "Verified", status: "open", waitMinutes: 25, busy: 60, minutesAgo: 60, services: ["General outpatient", "Pharmacy", "Laboratory"], hours: "Mon–Sun 8:00–20:00", sample: true },
    { id: "s7", name: "Sample Parklands Medical", area: "Parklands", address: "Sample address, Parklands", lat: -1.2622, lng: 36.8163, phone: "+254 700 000 007", trust: "Trusted", status: "open", waitMinutes: 15, busy: 40, minutesAgo: 35, services: ["General outpatient", "Optical", "Laboratory"], hours: "Mon–Sat 8:00–19:00", sample: true },
    { id: "s8", name: "Sample Karen Health Centre", area: "Karen", address: "Sample address, Karen", lat: -1.3350, lng: 36.7100, phone: "+254 700 000 008", trust: "Listed", status: "open", waitMinutes: 5, busy: 15, minutesAgo: 6000, services: ["General outpatient", "Physiotherapy"], hours: "Mon–Fri 8:30–17:00", sample: true }
  ]
};
