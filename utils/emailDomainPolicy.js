const blockedEmailDomains = new Set([
  "yopmail.com",
  "yopmail.fr",
  "yopmail.net",
  "tempmail.com",
  "temp-mail.org",
  "10minutemail.com",
  "mailinator.com",
  "guerrillamail.com",
  "throwawaymail.com",
  "trashmail.com",
  "dispostable.com",
  "maildrop.cc",
  "getnada.com",
]);

const getEmailDomain = (email = "") => email.split("@").pop()?.toLowerCase() || "";

const isBlockedEmail = (email) => blockedEmailDomains.has(getEmailDomain(email));

module.exports = {
  blockedEmailDomains,
  isBlockedEmail,
};
