/**
 * Sets a new password for an account, from the machine the database lives on.
 *
 *   npm run reset-password -- someone@example.com
 *   npm run reset-password -- someone@example.com "a new password"
 *
 * There is no "forgot password" link in the app, because reminders already go to the dashboard
 * rather than to email: no mail provider is configured, and a reset link that cannot be sent is
 * worse than none. That leaves anyone who mistypes a password at registration permanently locked
 * out of their own account, which is a real trap and this is the way out of it.
 *
 * It is deliberately a local command, not an endpoint. Whoever can run it already has the
 * database files; an HTTP route that reset passwords would be a much larger thing to get wrong.
 */
import crypto from 'node:crypto';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { User } from '../src/models/index.js';

const [email, givenPassword] = process.argv.slice(2);

if (!email) {
  console.error('Usage: npm run reset-password -- <email> [new password]');
  console.error('Omit the password and one will be generated for you.');
  process.exit(1);
}

// Readable rather than clever: this gets typed into a login form, possibly off a phone screen.
function generatePassword() {
  const words = ['harvest', 'monsoon', 'sapling', 'furrow', 'orchard', 'millet', 'jasmine', 'cardamom'];
  const pick = () => words[crypto.randomInt(words.length)];
  return `${pick()}-${pick()}-${crypto.randomInt(100, 999)}`;
}

const password = givenPassword ?? generatePassword();

if (password.length < 8) {
  console.error('That password is shorter than the 8 characters the app requires.');
  process.exit(1);
}

await connectDatabase();
try {
  // tokenVersion is select:false, so ask for it explicitly or it reads back as undefined and the
  // increment below would reset it to 1 instead of raising it.
  const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+tokenVersion');
  if (!user) {
    const known = await User.find({}).select('email').sort({ createdAt: 1 }).lean();
    console.error(`No account with the email ${email}.`);
    if (known.length) {
      console.error('\nAccounts in this database:');
      for (const u of known) console.error(`  ${u.email}`);
    }
    process.exitCode = 1;
  } else {
    await user.setPassword(password);
    // Every refresh token already issued to this account stops working, which is the point of a
    // reset: if someone else had the old password, their session ends here too.
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await user.save();

    console.log(`Password updated for ${user.email} (${user.name}).`);
    if (!givenPassword) console.log(`\n  New password:  ${password}\n`);
    console.log('Any device still signed in to this account has been signed out.');
  }
} finally {
  await disconnectDatabase();
}
