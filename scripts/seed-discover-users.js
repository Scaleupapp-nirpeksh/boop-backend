const mongoose = require('mongoose');
require('dotenv').config();

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const User = require('../src/models/User');
  const Answer = require('../src/models/Answer');
  const Question = require('../src/models/Question');

  // 1. Complete Nandan's remaining answers (Q4-Q15) to reach 15 and get 'ready'
  const nandanId = '69aeb5cad58e77789cbd69fd';
  const nandanAnswers = [
    { qn: 4, text: "I feel a little anxious but I try to remind myself people are busy. Still, I appreciate quick replies." },
    { qn: 5, choice: "A new city — adventure awaits" },
    { qn: 6, text: "Wake up late, make a big breakfast, go for a long walk in a park, maybe read a book at a cafe, and cook dinner with someone special." },
    { qn: 7, choice: "Address it directly and talk it through" },
    { qn: 8, text: "People think I'm being confrontational but I genuinely just want to resolve things. I care enough to bring it up." },
    { qn: 9, choice: "Quality time — I make time for them" },
    { qn: 10, text: "When someone remembers the small details about me - my favorite order, a story I told weeks ago. That shows they really listen." },
    { qn: 11, choice: "Somewhat — I open up gradually" },
    { qn: 12, text: "My insecurities about the future and whether I'm where I should be in life. I keep those fears pretty close." },
    { qn: 13, choice: "Mostly planned with room for spontaneity" },
    { qn: 14, text: "I taught myself to cook South Indian food properly. Dosa making is an art form that took me weeks to master." },
    { qn: 15, choice: "A few days to regroup" },
  ];

  for (const ans of nandanAnswers) {
    const question = await Question.findOne({ questionNumber: ans.qn });
    if (!question) continue;
    const existing = await Answer.findOne({ userId: nandanId, questionNumber: ans.qn });
    if (existing) continue;
    await Answer.create({
      userId: nandanId,
      questionId: question._id,
      questionNumber: ans.qn,
      textAnswer: ans.text || null,
      selectedOption: ans.choice || null,
      selectedOptions: [],
      timeSpent: Math.floor(Math.random() * 60) + 20,
      submittedAt: new Date(),
    });
  }
  await User.findByIdAndUpdate(nandanId, {
    questionsAnswered: 15,
    profileStage: 'ready',
    gender: 'male',
    interestedIn: 'women',
    dateOfBirth: new Date('1998-05-15'),
    'location.city': 'Mumbai',
    'location.coordinates': [72.8777, 19.0760],
  });
  console.log('Nandan: answers completed, stage=ready');

  // Ensure Nirpeksh has correct preferences
  await User.findByIdAndUpdate('69ad2ec8c0f6afbca97b2abb', {
    gender: 'male',
    interestedIn: 'women',
  });
  console.log('Nirpeksh: ensured gender=male, interestedIn=women');

  // 2. Create 6 new female users with distinct personalities
  const profiles = [
    {
      phone: '+919900100001',
      firstName: 'Aisha',
      dateOfBirth: new Date('1999-06-15'),
      city: 'Mumbai',
      bio: 'Literature nerd who believes every love story starts with a good conversation. Tea over coffee, always.',
      // HIGH compat - similar to Nirpeksh/Nandan
      answers: [
        { qn: 1, text: "I call my sister first! She's my person. We can talk for hours about the smallest things." },
        { qn: 2, choice: "I need alone time to decompress" },
        { qn: 3, choice: "It's pretty balanced" },
        { qn: 4, text: "I get a little uneasy but I've learned to give space. Everyone has their own pace of responding." },
        { qn: 5, choice: "Wherever life takes me" },
        { qn: 6, text: "Slow morning with chai, a long walk through old bookshops, cooking something elaborate for dinner while listening to old Hindi songs." },
        { qn: 7, choice: "Address it directly and talk it through" },
        { qn: 8, text: "That I'm too sensitive. I just process things deeply and that's actually a strength." },
        { qn: 9, choice: "Quality time — I make time for them" },
        { qn: 10, text: "When someone actively listens without trying to fix everything. Just being present means the world." },
        { qn: 11, choice: "Somewhat — I open up gradually" },
        { qn: 12, text: "My relationship with my body and self-image. It's a journey I'm still on." },
        { qn: 13, choice: "Mostly planned with room for spontaneity" },
        { qn: 14, text: "I taught myself calligraphy during the pandemic. My Urdu script is getting pretty decent now!" },
        { qn: 15, choice: "Almost immediately — failure motivates me" },
      ]
    },
    {
      phone: '+919900100002',
      firstName: 'Tara',
      dateOfBirth: new Date('2000-03-22'),
      city: 'Bangalore',
      bio: 'Software engineer by day, stand-up comedy open mic enthusiast by night. I communicate through memes.',
      answers: [
        { qn: 1, text: "I immediately post it in my group chat of 4 friends. We celebrate everything together, even small wins." },
        { qn: 2, choice: "I talk it out with someone close" },
        { qn: 3, choice: "I usually reach out first" },
        { qn: 4, text: "Honestly? I double text. Life is too short to play the waiting game. If I care, I show it." },
        { qn: 5, choice: "A new city — adventure awaits" },
        { qn: 6, text: "Brunch with friends, maybe a comedy show, then a spontaneous road trip to Nandi Hills if the vibes are right." },
        { qn: 7, choice: "Address it directly and talk it through" },
        { qn: 8, text: "People think I'm joking when I'm actually making a serious point. Humor is my coping mechanism." },
        { qn: 9, choice: "Words — I tell them how I feel" },
        { qn: 10, text: "When someone matches my energy. If I send a paragraph, I want a paragraph back. Effort should be mutual." },
        { qn: 11, choice: "Very comfortable — I'm an open book" },
        { qn: 12, text: "Career anxiety. Everyone thinks I have it figured out but I'm constantly questioning my path." },
        { qn: 13, choice: "Depends on the situation" },
        { qn: 14, text: "Writing comedy sets! Bombing on stage 15 times taught me more about resilience than any self-help book." },
        { qn: 15, choice: "Almost immediately — failure motivates me" },
      ]
    },
    {
      phone: '+919900100003',
      firstName: 'Zara',
      dateOfBirth: new Date('1998-11-08'),
      city: 'Delhi',
      bio: 'Architect who believes spaces shape emotions. Currently obsessed with Japanese minimalism and filter coffee.',
      answers: [
        { qn: 1, text: "I sit with the excitement alone first. Let it marinate. Then maybe tell my best friend over dinner." },
        { qn: 2, choice: "I journal or reflect quietly" },
        { qn: 3, choice: "I tend to wait for them" },
        { qn: 4, text: "I try not to read into it but honestly, I notice. I've learned to manage my expectations though." },
        { qn: 5, choice: "Abroad — the world is my home" },
        { qn: 6, text: "Wake up early, go to a farmers market, sketch at a cafe, maybe visit an art gallery. End with wine and a documentary." },
        { qn: 7, choice: "Give it some time before bringing it up" },
        { qn: 8, text: "That my silence means I'm angry. Sometimes I'm just processing. I need time to articulate how I feel." },
        { qn: 9, choice: "Acts of service — I do things for them" },
        { qn: 10, text: "When someone creates something for me or with me. A playlist, a meal, a plan — the effort in creation matters." },
        { qn: 11, choice: "Cautious — trust needs to be earned" },
        { qn: 12, text: "The pressure of being a woman in architecture. The subtle biases I face daily that I'm tired of explaining." },
        { qn: 13, choice: "Hardcore planner — I need structure" },
        { qn: 14, text: "Japanese joinery — wood connections without nails. It's like building relationships: no force, just fit." },
        { qn: 15, choice: "I need significant time to recover" },
      ]
    },
    {
      phone: '+919900100004',
      firstName: 'Diya',
      dateOfBirth: new Date('2001-01-30'),
      city: 'Mumbai',
      bio: 'Psychology student who asks too many questions. Kindness is the most attractive quality. Dog mom to a golden retriever named Biscuit.',
      answers: [
        { qn: 1, text: "My mom, always. Then I tell Biscuit (my dog) even though he just wags his tail at everything." },
        { qn: 2, choice: "I talk it out with someone close" },
        { qn: 3, choice: "I usually reach out first" },
        { qn: 4, text: "I used to spiral, but therapy taught me that people's response times aren't a measure of their love for me." },
        { qn: 5, choice: "Wherever life takes me" },
        { qn: 6, text: "Morning walk with Biscuit, brunch at a cozy cafe, reading psychology papers (yes I'm that person), cooking dinner with music on." },
        { qn: 7, choice: "Try to find a compromise right away" },
        { qn: 8, text: "That I'm analyzing them. I'm not! I just naturally try to understand where people are coming from." },
        { qn: 9, choice: "Quality time — I make time for them" },
        { qn: 10, text: "When someone is genuinely curious about my inner world. Not surface questions — real 'how are you' conversations." },
        { qn: 11, choice: "Somewhat — I open up gradually" },
        { qn: 12, text: "How much I worry about being good enough. The imposter syndrome is real and I hide it well." },
        { qn: 13, choice: "Mostly planned with room for spontaneity" },
        { qn: 14, text: "Pottery! There's something therapeutic about shaping clay. My first bowl was terrible but I love it." },
        { qn: 15, choice: "A few days to regroup" },
      ]
    },
    {
      phone: '+919900100005',
      firstName: 'Neha',
      dateOfBirth: new Date('1997-08-12'),
      city: 'Pune',
      bio: "Startup founder. Run a sustainable fashion brand. Intensity is my love language. I don't do anything half-heartedly.",
      answers: [
        { qn: 1, text: "My co-founder. We share everything — work wins, life wins, it's all intertwined." },
        { qn: 2, choice: "I distract myself with activities" },
        { qn: 3, choice: "I usually reach out first" },
        { qn: 4, text: "I honestly move on to the next thing. I have too much going on to wait around for texts." },
        { qn: 5, choice: "Abroad — the world is my home" },
        { qn: 6, text: "Perfect Sunday? Those don't exist. I'm usually working on the brand, hitting the gym at 6am, taking investor calls." },
        { qn: 7, choice: "Address it directly and talk it through" },
        { qn: 8, text: "That I'm cold or unfeeling. I just don't waste energy on unproductive emotional cycles." },
        { qn: 9, choice: "Acts of service — I do things for them" },
        { qn: 10, text: "When someone respects my time and ambition instead of competing with it. Support > attention." },
        { qn: 11, choice: "Very comfortable — I'm an open book" },
        { qn: 12, text: "Money stress. Running a startup means there are months where I question everything. Nobody sees that." },
        { qn: 13, choice: "Hardcore planner — I need structure" },
        { qn: 14, text: "Sustainable dyeing techniques using natural waste. We're experimenting with onion skin dyes now." },
        { qn: 15, choice: "Almost immediately — failure motivates me" },
      ]
    },
    {
      phone: '+919900100006',
      firstName: 'Riya',
      dateOfBirth: new Date('2000-09-05'),
      city: 'Mumbai',
      bio: 'Music teacher who thinks everyone has a song inside them. Hopeless romantic who still believes in handwritten letters.',
      answers: [
        { qn: 1, text: "I call my best friend, then my mom. But honestly, the first thing I do is smile to myself and sit with the feeling." },
        { qn: 2, choice: "I need alone time to decompress" },
        { qn: 3, choice: "It's pretty balanced" },
        { qn: 4, text: "I worry a little but I've learned that love isn't measured in response times. Still, I appreciate people who communicate." },
        { qn: 5, choice: "Wherever life takes me" },
        { qn: 6, text: "Sleep in, make pancakes, practice guitar on the balcony, maybe go to a live music cafe. Cook something comforting for dinner." },
        { qn: 7, choice: "Give it some time before bringing it up" },
        { qn: 8, text: "That I'm too emotional. I just feel things deeply and I think that's beautiful, not a weakness." },
        { qn: 9, choice: "Quality time — I make time for them" },
        { qn: 10, text: "When someone remembers the tiny things. The songs I mentioned, the stories I told. Attention is the rarest gift." },
        { qn: 11, choice: "Somewhat — I open up gradually" },
        { qn: 12, text: "The fear that I'll always choose love over stability and whether that makes me naive or brave." },
        { qn: 13, choice: "Mostly planned with room for spontaneity" },
        { qn: 14, text: "I taught myself to play the ukulele. Now I write silly songs about my cat and my students love them." },
        { qn: 15, choice: "A few days to regroup" },
      ]
    },
  ];

  for (const p of profiles) {
    let user = await User.findOne({ phone: p.phone });
    if (user) {
      console.log(`${p.firstName} already exists (${user._id}), updating...`);
      user.profileStage = 'ready';
      user.questionsAnswered = 15;
      await user.save();
    } else {
      user = await User.create({
        phone: p.phone,
        phoneVerified: true,
        firstName: p.firstName,
        dateOfBirth: p.dateOfBirth,
        gender: 'female',
        interestedIn: 'men',
        location: { city: p.city, coordinates: p.city === 'Mumbai' ? [72.8777, 19.0760] : p.city === 'Bangalore' ? [77.5946, 12.9716] : p.city === 'Delhi' ? [77.2090, 28.6139] : [73.8567, 18.5204] },
        bio: { text: p.bio },
        photos: { items: [], profilePhoto: null, totalPhotos: 0 },
        questionsAnswered: 15,
        profileStage: 'ready',
        isActive: true,
        isBanned: false,
      });
      console.log(`Created: ${p.firstName} (${user._id})`);
    }

    let created = 0;
    for (const ans of p.answers) {
      const question = await Question.findOne({ questionNumber: ans.qn });
      if (!question) continue;
      const existing = await Answer.findOne({ userId: user._id, questionNumber: ans.qn });
      if (existing) continue;
      await Answer.create({
        userId: user._id,
        questionId: question._id,
        questionNumber: ans.qn,
        textAnswer: ans.text || null,
        selectedOption: ans.choice || null,
        selectedOptions: [],
        timeSpent: Math.floor(Math.random() * 60) + 15,
        submittedAt: new Date(),
      });
      created++;
    }
    console.log(`  ${created} answers created`);
  }

  // Clear caches so compatibility scores compute fresh
  const cache = require('../src/utils/cache');
  cache.invalidateAll();
  console.log('\nCaches cleared');

  // Print summary
  console.log('\n=== Ready Users ===');
  const readyUsers = await User.find({ profileStage: 'ready' })
    .select('firstName gender interestedIn questionsAnswered location.city')
    .lean();
  readyUsers.forEach(u => {
    console.log(`  ${u.firstName || '???'} | ${u.gender} | wants: ${u.interestedIn} | ${u.questionsAnswered} answers | ${u.location?.city || '?'}`);
  });

  await mongoose.disconnect();
  console.log('\nDone!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
