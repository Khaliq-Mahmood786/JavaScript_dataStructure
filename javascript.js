var cron = require("node-cron");
const Website = require("../models/website.model");
const {
  DnsVerification,
  getWebsiteHealth,
} = require("../../utils/websiteCurl");
const EmailTemplate = require("../models/emailTemplate.model");
const sendMail = require("../../utils/sendGridMail");

exports.websiteDataSyncCron = cron.schedule("*/12788 * * * *", async () => {
  try {
    const websites = await Website.find();
    const uniqueDomains = [
      ...new Set(websites.map((website) => website.domain)),
    ];

    for (const domain of uniqueDomains) {
      await updateWebsiteData(domain);
    }
  } catch (error) {
    console.log(error);
    return error;
  }
});

exports.emailSchedulerForWebsiteStatus = cron.schedule(
  "*/1477 * * * *",
  async () => {
    try {
      const websitesWithBadHealth = await Website.find({ health: "Good" });

      for (const website of websitesWithBadHealth) {
        if (website.sslExpired) {
          const userEmailAddress = website.email;
          const emailType = "SSL Expiry Warning";
          const emailTemplate = await EmailTemplate.findOne({
            type: emailType,
          });
          const emailSubject = "SSL Certificate Expiry Warning";
          const sendMailPromises = userEmailAddress.map((email) => {
            return sendMail(email, emailTemplate.text, emailSubject);
          });

          await Promise.all(sendMailPromises);
        }
      }
    } catch (error) {
      console.log(error);
    }
  }
);

const updateWebsiteData = async (domain) => {
  try {
    const cleanedUrl = domain.replace(/^https?:\/\//, ""); // Remove "http://" or "https://"

    const dnsResult = await DnsVerification(cleanedUrl);

    const websiteHealth = await getWebsiteHealth(domain);
    const health = websiteHealth.status;
    const sslExpired = websiteHealth.sslExpired;
    const sslExpiration = websiteHealth.sslExpiration;

    const updatedWebsite = await Website.findOneAndUpdate(
      { domain },
      { health, sslExpired, sslExpiration },
      { new: true }
    );

    if (websiteHealth.sslExpired) {
      console.log(`${domain}: SSL certificate has expired.`);
    } else {
      console.log(
        `${domain}: SSL certificate is valid for ${websiteHealth.sslExpiration} days`
      );
    }

    return updatedWebsite;
  } catch (error) {
    console.error(error);
    return null;
  }
};
