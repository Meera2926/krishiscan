/**
 * Makes an existing account an admin, from the machine the database lives on.
 *
 *   npm run make-admin -- someone@example.com
 *
 * Admins decide which experts farmers can trust, so becoming one is deliberately not something
 * the app offers: there is no sign-up for it and no endpoint that grants it. Whoever can run this
 * already has the database, which is the only place that decision should be made from.
 */
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { User } from '../src/models/index.js';
import { releaseOpenCases } from '../src/services/experts.js';

const [email] = process.argv.slice(2);

if (!email) {
  console.error('Usage: npm run make-admin -- <email>');
  console.error('The account must exist already: register it in the app first.');
  process.exit(1);
}

await connectDatabase();
try {
  const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+tokenVersion');
  if (!user) {
    console.error(`No account with the email ${email}. Register it in the app first, then run this again.`);
    process.exitCode = 1;
  } else if (user.role === 'admin') {
    console.log(`${user.email} (${user.name}) is already an admin.`);
  } else {
    const was = user.role;
    user.role = 'admin';
    // The role travels inside the sign-in token, so end the old sessions and let the next sign-in
    // carry the new one, rather than leaving a token that still says "farmer".
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await user.save();
    console.log(`${user.email} (${user.name}) is now an admin (was ${was}).`);
    if (was === 'expert') {
      // An admin cannot answer cases, so anything this expert was still working would wait forever.
      const released = await releaseOpenCases(user._id);
      console.log('Admins oversee experts but do not answer cases, so this account no longer advises farmers.');
      if (released) console.log(`${released} unfinished case(s) went back to the open queue for another expert.`);
    }
    console.log('Sign in again to open Expert applications.');
  }
} finally {
  await disconnectDatabase();
}
