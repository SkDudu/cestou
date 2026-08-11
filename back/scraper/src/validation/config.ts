export const validationConfig = {
  minNameLength: 3,
  maxNameLength: 250,
  maxSuspiciousPrice: 1000,
  knownUnits: new Set([
    "kg",
    "g",
    "mg",
    "l",
    "ml",
    "un",
    "pack",
    "cx",
    "pct",
  ]),
};
