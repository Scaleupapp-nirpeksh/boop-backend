/**
 * Seeds demo users with answers for testing the Discovery feed.
 * These users will be visible to a male user interested in women in Bangalore.
 *
 * Usage: node src/scripts/seedDemoUsers.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Answer = require('../models/Answer');
const Question = require('../models/Question');

const DEMO_USERS = [
  {
    firstName: 'Priya',
    phone: '+919900000001',
    dateOfBirth: new Date('1999-04-12'),
    gender: 'female',
    interestedIn: 'men',
    bio: { text: 'Chai over coffee. Books over screens. Deep conversations over small talk.' },
    location: { city: 'Bangalore', coordinates: [77.5946, 12.9716] },
  },
  {
    firstName: 'Ananya',
    phone: '+919900000002',
    dateOfBirth: new Date('2000-08-23'),
    gender: 'female',
    interestedIn: 'men',
    bio: { text: 'Product designer by day, amateur potter by night. Looking for someone who gets excited about tiny details.' },
    location: { city: 'Bangalore', coordinates: [77.6101, 12.9352] },
  },
  {
    firstName: 'Meera',
    phone: '+919900000003',
    dateOfBirth: new Date('1998-01-07'),
    gender: 'female',
    interestedIn: 'everyone',
    bio: { text: 'Classical dancer exploring contemporary life. I believe vulnerability is strength.' },
    location: { city: 'Bangalore', coordinates: [77.5800, 12.9850] },
  },
  {
    firstName: 'Kavya',
    phone: '+919900000004',
    dateOfBirth: new Date('2001-11-30'),
    gender: 'female',
    interestedIn: 'men',
    bio: { text: 'Startup founder who still makes time for sunrise walks. Ask me about my 50 houseplants.' },
    location: { city: 'Bangalore', coordinates: [77.6200, 12.9600] },
  },
  {
    firstName: 'Rhea',
    phone: '+919900000005',
    dateOfBirth: new Date('1999-06-15'),
    gender: 'female',
    interestedIn: 'men',
    bio: { text: 'Therapist in training. I think emotional intelligence is the most attractive quality.' },
    location: { city: 'Bangalore', coordinates: [77.5700, 12.9500] },
  },
  {
    firstName: 'Isha',
    phone: '+919900000006',
    dateOfBirth: new Date('2000-03-08'),
    gender: 'female',
    interestedIn: 'everyone',
    bio: { text: 'Music producer and late-night philosopher. I write songs about strangers on the metro.' },
    location: { city: 'Bangalore', coordinates: [77.6050, 12.9780] },
  },
];

// Sample answers for each demo user (mapped to Day 1 questions)
const SAMPLE_ANSWERS = [
  [
    { qNum: 1, text: 'I feel most at peace when I\'m sitting by a lake with a good book and no notifications.' },
    { qNum: 2, text: 'I\'d want to know if they truly listen when someone talks — not just waiting for their turn.' },
    { qNum: 3, text: 'Honesty, even when it\'s uncomfortable. I\'d rather hear a hard truth than a comfortable lie.' },
    { qNum: 5, text: 'I grew up believing love meant sacrifice, but now I think it means growing together without losing yourself.' },
    { qNum: 7, text: 'I\'m a morning person who becomes a night owl when the conversation is right.' },
    { qNum: 9, text: 'Travel taught me that home isn\'t a place — it\'s a feeling of being understood.' },
  ],
  [
    { qNum: 1, text: 'Long walks after dinner, especially when the city is quiet and the streetlights are warm.' },
    { qNum: 2, text: 'Whether they\'re kind to people who can do nothing for them.' },
    { qNum: 3, text: 'Curiosity. A partner who asks "why" and "tell me more" keeps the relationship alive.' },
    { qNum: 5, text: 'Love is choosing someone every day, not just on the easy days.' },
    { qNum: 7, text: 'I need my alone time to recharge, but I love cooking dinner together.' },
    { qNum: 9, text: 'Living abroad taught me that comfort zones are overrated.' },
  ],
  [
    { qNum: 1, text: 'Dancing alone in my room to old Bollywood songs — pure therapy.' },
    { qNum: 2, text: 'How they handle disagreements. Do they fight to win, or fight to understand?' },
    { qNum: 3, text: 'Emotional availability. I want someone who shows up, not just someone who shows off.' },
    { qNum: 5, text: 'I used to think love was fireworks, but now I think it\'s a quiet warmth that stays.' },
    { qNum: 7, text: 'Weekends are sacred — one day for adventures, one day for doing absolutely nothing.' },
    { qNum: 9, text: 'My grandmother taught me that the strongest people are the ones who can be gentle.' },
  ],
  [
    { qNum: 1, text: 'Building something from scratch — whether it\'s a company, a bookshelf, or a friendship.' },
    { qNum: 2, text: 'Their relationship with their own emotions. Self-aware people make the best partners.' },
    { qNum: 3, text: 'Shared laughter. If we can laugh at the absurdity of life together, we can handle anything.' },
    { qNum: 5, text: 'Love isn\'t finding a perfect person, it\'s learning to see an imperfect person perfectly.' },
    { qNum: 7, text: 'I work hard but I play harder. Balance is everything.' },
    { qNum: 9, text: 'Every houseplant I\'ve kept alive has taught me something about patience and care.' },
  ],
  [
    { qNum: 1, text: 'Helping someone untangle their thoughts during a conversation. It\'s like solving a beautiful puzzle.' },
    { qNum: 2, text: 'How they talk about their exes. It tells you everything about their emotional maturity.' },
    { qNum: 3, text: 'Consistency. Grand gestures are nice, but daily kindness builds a life together.' },
    { qNum: 5, text: 'Studying psychology taught me that we often love in the patterns we learned as children.' },
    { qNum: 7, text: 'Early mornings with coffee and journaling. Evenings with wine and real conversations.' },
    { qNum: 9, text: 'I believe everyone deserves to be seen — not just looked at, but truly seen.' },
  ],
  [
    { qNum: 1, text: 'Producing a beat at 2 AM when the whole world is asleep and the music just flows.' },
    { qNum: 2, text: 'Whether they have passions that light up their eyes when they talk about them.' },
    { qNum: 3, text: 'Authenticity. I\'d rather be with someone raw and real than polished and performative.' },
    { qNum: 5, text: 'I write love songs but I\'ve only just started learning what love actually means in practice.' },
    { qNum: 7, text: 'Spontaneous. I love last-minute plans and "let\'s just go" energy.' },
    { qNum: 9, text: 'Strangers on the metro have inspired more songs than I can count. Everyone has a story.' },
  ],
];

async function seed() {
  console.log('🌱 Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected\n');

  // Get Day 1 questions
  const questions = await Question.find({ dayAvailable: { $lte: 2 } }).lean();
  const questionMap = new Map(questions.map((q) => [q.questionNumber, q]));

  for (let i = 0; i < DEMO_USERS.length; i++) {
    const userData = DEMO_USERS[i];
    const answers = SAMPLE_ANSWERS[i];

    // Upsert user by phone
    let user = await User.findOne({ phone: userData.phone });
    if (user) {
      console.log(`♻️  Updating existing user: ${userData.firstName}`);
      Object.assign(user, {
        ...userData,
        profileStage: 'ready',
        isActive: true,
        isBanned: false,
        phoneVerified: true,
        questionsAnswered: answers.length,
      });
      await user.save();
    } else {
      console.log(`✨ Creating user: ${userData.firstName}`);
      user = await User.create({
        ...userData,
        profileStage: 'ready',
        isActive: true,
        isBanned: false,
        phoneVerified: true,
        questionsAnswered: answers.length,
      });
    }

    // Seed answers
    for (const ans of answers) {
      const question = questionMap.get(ans.qNum);
      if (!question) {
        console.log(`   ⚠️  Question ${ans.qNum} not found, skipping`);
        continue;
      }

      await Answer.findOneAndUpdate(
        { userId: user._id, questionNumber: ans.qNum },
        {
          userId: user._id,
          questionId: question._id,
          questionNumber: ans.qNum,
          textAnswer: ans.text,
          submittedAt: new Date(),
        },
        { upsert: true, new: true }
      );
    }

    console.log(`   ✅ ${answers.length} answers seeded for ${userData.firstName}`);
  }

  console.log('\n🎉 Demo users seeded!');
  await mongoose.disconnect();
  console.log('🔌 Disconnected');
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
