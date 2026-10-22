/**
 * Demo businesses around Singapore. All names are fictional; the areas and map positions are real neighbourhoods.
 * Every business shares the same structure (6 shifts, 14 staff, one shift that needs a qualified lead) so the
 * agent and its tests run unchanged. Only labels, names and the qualification differ.
 */

export type Industry = "Café" | "Bakery" | "Salon" | "Clinic" | "Retail" | "Warehouse";

export type BusinessProfile = {
  id: string;
  name: string;
  outlet: string;
  address: string;
  industry: Industry;
  coords: { lat: number; lng: number };
  /** e.g. "food-safety certificate": what the lead shifts need */
  certShort: string;
  /** e.g. "a certified lead": used in sentences */
  certNeed: string;
  /** the rule text when someone lacks it */
  certMissing: string;
  slotRoles: Record<"open-lead" | "barista-am" | "kitchen" | "barista-pm" | "close-lead" | "service-pm", string>;
  /** maps the base staff roles to this business's job titles */
  roles: Record<string, string>;
  /** display names keyed by the internal staff id */
  names: Record<string, string>;
  /** the three other branches staff can come from */
  branches: { Somerset: string; Tampines: string; Bugis: string };
  /** what the person on the evening lead shift texts when they call in sick */
  sickText: string;
  /** a free Unsplash photo that looks like this kind of shop (no real shop names or logos) */
  photo: string;
};

const unsplash = (id: string) => `https://images.unsplash.com/${id}?w=1400&q=70&auto=format&fit=crop`;

const SAME = { aisha: "Aisha", wei: "Wei", siti: "Siti", ben: "Ben", hana: "Hana", daniel: "Daniel", farah: "Farah", mei: "Mei", jun: "Jun", priya: "Priya", marcus: "Marcus", chloe: "Chloe", raj: "Raj", leon: "Leon" };

export const BUSINESSES: BusinessProfile[] = [
  {
    id: "kopi",
    photo: unsplash("photo-1756158449200-678a8de156ac"),
    name: "Kopi & Co",
    outlet: "Orchard",
    address: "Kopi & Co Orchard, level B2 (demo outlet)",
    industry: "Café",
    coords: { lat: 1.3036, lng: 103.8318 },
    certShort: "food-safety certificate",
    certNeed: "a certified lead",
    certMissing: "No food-safety certificate: can't lead a shift",
    slotRoles: { "open-lead": "Opening lead", "barista-am": "Barista", kitchen: "Kitchen crew", "barista-pm": "Barista", "close-lead": "Closing lead", "service-pm": "Service crew" },
    roles: {},
    names: SAME,
    branches: { Somerset: "Somerset", Tampines: "Tampines", Bugis: "Bugis" },
    sickText: "so sorry, fever since this afternoon 🤒 can't make tonight's close",
  },
  {
    id: "bakery",
    photo: unsplash("photo-1722308253219-4f491ff1bc89"),
    name: "Sunrise Bakehouse",
    outlet: "Tiong Bahru",
    address: "Sunrise Bakehouse, Tiong Bahru (demo outlet)",
    industry: "Bakery",
    coords: { lat: 1.2852, lng: 103.8303 },
    certShort: "food-safety certificate",
    certNeed: "a certified supervisor",
    certMissing: "No food-safety certificate: can't supervise a shift",
    slotRoles: { "open-lead": "Head baker", "barista-am": "Counter", kitchen: "Pastry", "barista-pm": "Counter", "close-lead": "Closing supervisor", "service-pm": "Packing crew" },
    roles: { "Closing lead": "Closing supervisor", "Opening lead": "Head baker", Barista: "Counter crew", "Service crew": "Packing crew", "Food-safety lead": "Supervisor", "Senior crew": "Senior baker", "Shift lead": "Shift supervisor", "Kitchen crew": "Pastry crew" },
    names: { aisha: "Nurul", wei: "Jia Hui", siti: "Kavitha", ben: "Ethan", hana: "Shu Fen", daniel: "Arjun", farah: "Zarina", mei: "Li Ting", jun: "Ryan", priya: "Divya", marcus: "Hafiz", chloe: "Rachel", raj: "Ming", leon: "Kelvin" },
    branches: { Somerset: "Bukit Merah", Tampines: "Punggol", Bugis: "Queenstown" },
    sickText: "so sorry, fever since this afternoon 🤒 can't make tonight's closing shift",
  },
  {
    id: "salon",
    photo: unsplash("photo-1781450090585-1a511b7066d9"),
    name: "Lumière Hair Studio",
    outlet: "Holland Village",
    address: "Lumière Hair Studio, Holland Village (demo outlet)",
    industry: "Salon",
    coords: { lat: 1.3112, lng: 103.7961 },
    certShort: "senior stylist grade",
    certNeed: "a senior stylist",
    certMissing: "Not a senior stylist: can't take the evening chair",
    slotRoles: { "open-lead": "Senior stylist (AM)", "barista-am": "Reception", kitchen: "Colourist", "barista-pm": "Reception", "close-lead": "Senior stylist (PM)", "service-pm": "Salon assistant" },
    roles: { "Closing lead": "Senior stylist", "Opening lead": "Senior stylist", Barista: "Receptionist", "Service crew": "Salon assistant", "Food-safety lead": "Senior stylist", "Senior crew": "Senior stylist", "Shift lead": "Senior stylist", "Kitchen crew": "Colourist" },
    names: { aisha: "Sabrina", wei: "Wen Xin", siti: "Aqilah", ben: "Jaden", hana: "Yuki", daniel: "Vikram", farah: "Nadia", mei: "Ling", jun: "Darren", priya: "Ananya", marcus: "Irfan", chloe: "Joanne", raj: "Bryan", leon: "Gabriel" },
    branches: { Somerset: "Dempsey", Tampines: "Bedok", Bugis: "Novena" },
    sickText: "so sorry, fever since this afternoon 🤒 can't take my evening clients",
  },
  {
    id: "clinic",
    photo: unsplash("photo-1519494026892-80bbd2d6fd0d"),
    name: "Harbourside Family Clinic",
    outlet: "Tanjong Pagar",
    address: "Harbourside Family Clinic, Tanjong Pagar (demo clinic)",
    industry: "Clinic",
    coords: { lat: 1.2766, lng: 103.8457 },
    certShort: "nursing registration",
    certNeed: "a registered nurse",
    certMissing: "Not a registered nurse: can't run the evening session",
    slotRoles: { "open-lead": "Nurse (AM)", "barista-am": "Front desk", kitchen: "Pharmacy assistant", "barista-pm": "Front desk", "close-lead": "Nurse (evening)", "service-pm": "Clinic assistant" },
    roles: { "Closing lead": "Staff nurse", "Opening lead": "Staff nurse", Barista: "Front desk", "Service crew": "Clinic assistant", "Food-safety lead": "Staff nurse", "Senior crew": "Senior nurse", "Shift lead": "Staff nurse", "Kitchen crew": "Pharmacy assistant" },
    names: { aisha: "Farhana", wei: "Hui Min", siti: "Lakshmi", ben: "Alvin", hana: "Pei Shan", daniel: "Rajesh", farah: "Amirah", mei: "Xin Yi", jun: "Benjamin", priya: "Meera", marcus: "Faizal", chloe: "Grace", raj: "Kenneth", leon: "Justin" },
    branches: { Somerset: "Outram", Tampines: "Pasir Ris", Bugis: "Bishan" },
    sickText: "so sorry, fever since this afternoon 🤒 can't do tonight's evening session",
  },
  {
    id: "books",
    photo: unsplash("photo-1648999528869-5292670c6681"),
    name: "Inkwell Books",
    outlet: "Bugis",
    address: "Inkwell Books, Bugis (demo store)",
    industry: "Retail",
    coords: { lat: 1.3007, lng: 103.8558 },
    certShort: "key-holder access",
    certNeed: "a key-holder",
    certMissing: "Not a key-holder: can't open or close the store",
    slotRoles: { "open-lead": "Opening key-holder", "barista-am": "Cashier", kitchen: "Stockroom", "barista-pm": "Cashier", "close-lead": "Closing key-holder", "service-pm": "Floor assistant" },
    roles: { "Closing lead": "Key-holder", "Opening lead": "Key-holder", Barista: "Cashier", "Service crew": "Floor assistant", "Food-safety lead": "Key-holder", "Senior crew": "Senior sales", "Shift lead": "Key-holder", "Kitchen crew": "Stockroom crew" },
    names: { aisha: "Hidayah", wei: "Zhi Hao", siti: "Revathi", ben: "Lucas", hana: "Min Ji", daniel: "Sanjay", farah: "Syafiqah", mei: "Jing Wen", jun: "Ivan", priya: "Shalini", marcus: "Rizwan", chloe: "Megan", raj: "Joel", leon: "Nicholas" },
    branches: { Somerset: "City Hall", Tampines: "Jurong East", Bugis: "Bras Basah" },
    sickText: "so sorry, fever since this afternoon 🤒 can't make tonight's closing shift",
  },
  {
    id: "logistics",
    photo: unsplash("photo-1587293852726-70cdb56c2866"),
    name: "SwiftBox Logistics",
    outlet: "Tuas",
    address: "SwiftBox Logistics, Tuas hub (demo warehouse)",
    industry: "Warehouse",
    coords: { lat: 1.3224, lng: 103.6486 },
    certShort: "forklift licence",
    certNeed: "a licensed shift lead",
    certMissing: "No forklift licence: can't lead the night shift",
    slotRoles: { "open-lead": "Morning dispatcher", "barista-am": "Packer", kitchen: "Forklift operator", "barista-pm": "Packer", "close-lead": "Night shift lead", "service-pm": "Loader" },
    roles: { "Closing lead": "Shift lead", "Opening lead": "Dispatcher", Barista: "Packer", "Service crew": "Loader", "Food-safety lead": "Forklift lead", "Senior crew": "Senior operator", "Shift lead": "Shift lead", "Kitchen crew": "Forklift operator" },
    names: { aisha: "Haziq", wei: "Jun Wei", siti: "Murugan", ben: "Kok Leong", hana: "Rahim", daniel: "Arif", farah: "Gopal", mei: "Wei Ming", jun: "Daryl", priya: "Suresh", marcus: "Azman", chloe: "Terence", raj: "Hong Wei", leon: "Faris" },
    branches: { Somerset: "Jurong", Tampines: "Woodlands", Bugis: "Pioneer" },
    sickText: "so sorry, fever since this afternoon 🤒 can't make tonight's shift",
  },
];

export const businessById = (id?: string) => BUSINESSES.find((b) => b.id === id) ?? BUSINESSES[0];
