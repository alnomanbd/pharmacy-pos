import { connectDB, disconnectDB } from '../config/db.js';
import { UserModel } from '../models/index.js';
import { logger } from '../utils/logger.js';

/**
 * Removes a staff or operator account by email.
 *
 * A blunt tool, kept for the cases the UI deliberately cannot handle: a platform
 * admin created under the wrong address, or a seeded account that should never
 * have existed on this deployment. Shop staff are removed from the Staff page,
 * which soft-deletes and keeps the audit trail.
 *
 *   npm run user:remove someone@example.com
 */
async function run() {
  const email = (process.argv[2] || '').toLowerCase().trim();
  if (!email) {
    logger.error('Pass the email to remove: npm run user:remove someone@example.com');
    process.exitCode = 1;
    return;
  }

  await connectDB();
  try {
    const user = await UserModel.findOne({ email }).select('name email role organization').lean();
    if (!user) {
      logger.warn({ email }, 'No account with that email');
      return;
    }

    // Refuses to leave the deployment with no operator — locking yourself out of
    // the console is not recoverable from the UI.
    if (user.role === 'platformAdmin') {
      const others = await UserModel.countDocuments({
        role: 'platformAdmin',
        _id: { $ne: user._id },
      });
      if (others === 0) {
        logger.error(
          { email },
          'That is the only platform admin. Create another first: npm run seed:platform-admin',
        );
        process.exitCode = 1;
        return;
      }
    }

    await UserModel.deleteOne({ _id: user._id });
    logger.info({ email, role: user.role, name: user.name }, 'Account removed');
  } finally {
    await disconnectDB();
  }
}

void run();
