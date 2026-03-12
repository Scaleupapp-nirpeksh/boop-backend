const asyncHandler = require('../utils/asyncHandler');
const User = require('../models/User');

/**
 * @desc    Get limited public profile for App Clip preview
 * @route   GET /api/v1/public/profile/:userId
 * @access  Public (no auth required)
 */
const getPublicProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.userId)
    .select('firstName location.city profileStage questionsAnswered photos.profilePhoto.blurredUrl photos.profilePhoto.silhouetteUrl')
    .lean();

  if (!user || !user.firstName) {
    const error = new Error('Profile not found');
    error.statusCode = 404;
    throw error;
  }

  res.json({
    success: true,
    profile: {
      firstName: user.firstName,
      city: user.location?.city || null,
      questionsAnswered: user.questionsAnswered || 0,
      profileReady: user.profileStage === 'ready',
      // Only return blurred/silhouette photo — never full photos publicly
      photo: user.photos?.profilePhoto?.silhouetteUrl || user.photos?.profilePhoto?.blurredUrl || null,
    },
  });
});

module.exports = { getPublicProfile };
