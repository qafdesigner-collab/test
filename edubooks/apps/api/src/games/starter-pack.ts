/**
 * Ready-made games for the General games and Sports collections: general early-years content (not textbook content),
 * so every school has something to play from day one. Added from Game library → "Add starter games", and with the demo data.
 */
export interface StarterGame { engine: string; title: string; instructions: string; difficulty: number; categories: string[]; content: unknown }

export const STARTER_GAMES: StarterGame[] = [
  // ⚽ Sports
  { engine: 'PENALTY_KICK', title: 'Penalty Kick: Add it up', instructions: 'Choose the right answer to kick the ball into the goal!', difficulty: 1, categories: ['SPORTS', 'GENERAL'],
    content: { questions: [
      { prompt: '2 + 3 = ?', options: ['4', '5', '6'], answer: 1 }, { prompt: '4 + 4 = ?', options: ['8', '7', '9'], answer: 0 },
      { prompt: '10 − 3 = ?', options: ['6', '8', '7'], answer: 2 }, { prompt: '5 + 1 = ?', options: ['6', '4', '5'], answer: 0 },
      { prompt: '9 − 4 = ?', options: ['3', '5', '6'], answer: 1 }, { prompt: '3 + 3 = ?', options: ['5', '9', '6'], answer: 2 } ] } },
  { engine: 'PENALTY_KICK', title: 'Penalty Kick: Sports quiz', instructions: 'Answer right and score a goal!', difficulty: 2, categories: ['SPORTS'],
    content: { questions: [
      { prompt: 'How many players are in a football team on the pitch?', options: ['9', '11', '7'], answer: 1 },
      { prompt: 'Which ball is the biggest?', options: ['🏀 Basketball', '🎾 Tennis ball', '⚾ Baseball'], answer: 0 },
      { prompt: 'In which sport do you use a racket?', options: ['Swimming', 'Tennis', 'Running'], answer: 1 },
      { prompt: 'What do you wear to swim?', options: ['🥽 Goggles', '🧤 Gloves', '🧣 Scarf'], answer: 0 },
      { prompt: 'Which one is a winter sport?', options: ['⛷️ Skiing', '🏄 Surfing', '🏖️ Beach volleyball'], answer: 0 },
      { prompt: 'Where do you play cricket?', options: ['On a pitch', 'In a pool', 'On ice'], answer: 0 } ] } },
  { engine: 'RUNNING_RACE', title: 'Running Race: Times tables', instructions: 'Answer fast to beat the rabbit to the finish line!', difficulty: 2, categories: ['SPORTS', 'GENERAL'],
    content: { seconds: 9, rival: '🐇', questions: [
      { prompt: '2 × 3 = ?', options: ['6', '5', '8'], answer: 0 }, { prompt: '5 × 2 = ?', options: ['7', '10', '12'], answer: 1 },
      { prompt: '3 × 3 = ?', options: ['6', '12', '9'], answer: 2 }, { prompt: '4 × 2 = ?', options: ['8', '6', '10'], answer: 0 },
      { prompt: '10 × 1 = ?', options: ['1', '10', '11'], answer: 1 }, { prompt: '2 × 6 = ?', options: ['14', '10', '12'], answer: 2 },
      { prompt: '5 × 5 = ?', options: ['25', '20', '30'], answer: 0 } ] } },
  { engine: 'RUNNING_RACE', title: 'Running Race: Animal sounds', instructions: 'Which animal says it? Run, run, run!', difficulty: 1, categories: ['SPORTS', 'GENERAL'],
    content: { seconds: 10, rival: '🐢', questions: [
      { prompt: 'Who says “Moo”?', options: ['🐮', '🐶', '🐱'], answer: 0 }, { prompt: 'Who says “Woof”?', options: ['🐔', '🐶', '🐑'], answer: 1 },
      { prompt: 'Who says “Meow”?', options: ['🐷', '🐴', '🐱'], answer: 2 }, { prompt: 'Who says “Baa”?', options: ['🐑', '🐮', '🦆'], answer: 0 },
      { prompt: 'Who says “Quack”?', options: ['🐸', '🦆', '🐝'], answer: 1 }, { prompt: 'Who says “Roar”?', options: ['🦁', '🐭', '🐰'], answer: 0 } ] } },
  { engine: 'WHACK_A_MOLE', title: 'Whack-a-Mole: Even numbers', instructions: 'Bonk only the even numbers!', difficulty: 2, categories: ['SPORTS', 'GENERAL'],
    content: { task: 'Bonk the even numbers!', targets: ['2', '4', '6', '8', '10', '12'], others: ['1', '3', '5', '7', '9', '11'], goal: 10, seconds: 60 } },
  { engine: 'WHACK_A_MOLE', title: 'Whack-a-Mole: Sports balls', instructions: 'Bonk every ball you see!', difficulty: 1, categories: ['SPORTS'],
    content: { task: 'Bonk the balls!', targets: ['⚽', '🏀', '🏐', '🎾', '🏈', '⚾'], others: ['🍎', '🐱', '🌟', '🚗', '🎈'], goal: 10, seconds: 60 } },
  { engine: 'SORTING', title: 'Sports sort: Ball or no ball?', instructions: 'Put each sport in the right basket.', difficulty: 1, categories: ['SPORTS'],
    content: { categories: [{ name: 'With a ball', items: ['⚽', '🏀', '🎾', '🏐'] }, { name: 'No ball', items: ['🏊', '🚴', '🏃', '🤸'] }] } },
  { engine: 'MEMORY', title: 'Sports memory', instructions: 'Find the pairs: the picture and its sport.', difficulty: 1, categories: ['SPORTS'],
    content: { pairs: [{ a: '⚽', b: 'football' }, { a: '🏀', b: 'basketball' }, { a: '🏊', b: 'swimming' }, { a: '🚴', b: 'cycling' }, { a: '🎾', b: 'tennis' }, { a: '🏏', b: 'cricket' }] } },
  { engine: 'FINGERS', title: 'Fingers workout', instructions: 'Show the right number of fingers to the camera!', difficulty: 1, categories: ['SPORTS'],
    content: { rounds: [{ show: '2', answer: 2 }, { show: '⚽⚽⚽', answer: 3 }, { show: '1 + 4', answer: 5 }, { show: '🏀🏀🏀🏀', answer: 4 }, { show: '10', answer: 10 }] } },
  // 🎲 General games
  { engine: 'WHACK_A_MOLE', title: 'Whack-a-Mole: Vowels', instructions: 'Bonk the vowels a, e, i, o, u!', difficulty: 1, categories: ['GENERAL'],
    content: { task: 'Bonk the vowels!', targets: ['a', 'e', 'i', 'o', 'u'], others: ['b', 'c', 'd', 'm', 's', 't'], goal: 10, seconds: 60 } },
  { engine: 'MEMORY', title: 'Colour memory', instructions: 'Turn two cards to find a colour and its name.', difficulty: 1, categories: ['GENERAL'],
    content: { pairs: [{ a: '🔴', b: 'red' }, { a: '🔵', b: 'blue' }, { a: '🟢', b: 'green' }, { a: '🟡', b: 'yellow' }, { a: '🟣', b: 'purple' }, { a: '🟠', b: 'orange' }] } },
  { engine: 'COUNTING', title: 'Count the fruit', instructions: 'Count and choose the right number.', difficulty: 1, categories: ['GENERAL'],
    content: { things: ['🍎', '🍌', '🍓', '🍊'], min: 1, max: 10, rounds: 6 } },
  { engine: 'SORTING', title: 'Land, sea or sky?', instructions: 'Where does each one live or go?', difficulty: 2, categories: ['GENERAL'],
    content: { categories: [{ name: 'Land', items: ['🐘', '🦁', '🚗'] }, { name: 'Sea', items: ['🐳', '🐠', '⛵'] }, { name: 'Sky', items: ['🦅', '✈️', '🎈'] }] } },
  { engine: 'SHAPES', title: 'Shape detective', instructions: 'Find the shape I say.', difficulty: 1, categories: ['GENERAL'],
    content: { shapes: ['circle', 'square', 'triangle', 'star', 'heart', 'rectangle'], rounds: 8 } },
  { engine: 'QUIZ', title: 'Healthy habits quiz', instructions: 'What keeps us healthy?', difficulty: 1, categories: ['GENERAL', 'SPORTS'],
    content: { questions: [
      { prompt: 'What should you drink when you play sports?', options: ['💧 Water', '🥤 Fizzy drink', '🍭 Juice with sugar'], answer: 0 },
      { prompt: 'When do you wash your hands?', options: ['Before eating', 'Never', 'Only on Fridays'], answer: 0 },
      { prompt: 'How many hours should children sleep?', options: ['About 10', 'About 4', 'About 2'], answer: 0 },
      { prompt: 'Which is a healthy snack?', options: ['🍎 Apple', '🍬 Sweets', '🍟 Chips'], answer: 0 },
      { prompt: 'What do you do before running?', options: ['Warm up', 'Eat a big meal', 'Go to sleep'], answer: 0 } ] } },
  { engine: 'WORD_BUILD', title: 'Build the word', instructions: 'Put the letters in the right order.', difficulty: 2, categories: ['GENERAL'],
    content: { words: [{ word: 'ball', hint: '⚽' }, { word: 'sun', hint: '☀️' }, { word: 'fish', hint: '🐟' }, { word: 'tree', hint: '🌳' }, { word: 'cake', hint: '🎂' }] } },
  { engine: 'LISTENING', title: 'Listen and find', instructions: 'Listen, then tap the right picture.', difficulty: 1, categories: ['GENERAL'],
    content: { rounds: [{ say: 'Find the moon', options: ['🌙', '☀️', '⭐'], answer: 0 }, { say: 'Find the car', options: ['🚲', '🚗', '✈️'], answer: 1 },
      { say: 'Find the banana', options: ['🍎', '🍇', '🍌'], answer: 2 }, { say: 'Find the football', options: ['⚽', '🏀', '🎾'], answer: 0 }] } },
  { engine: 'BUBBLE_POP', title: 'Pop the numbers', instructions: 'Pop only the bubbles with numbers!', difficulty: 1, categories: ['GENERAL'],
    content: { task: 'Pop the numbers!', targets: ['1', '2', '3', '4', '5', '6', '7', '8', '9'], others: ['A', 'B', 'C', '🐶', '🍎'], goal: 10, seconds: 60 } },
  { engine: 'TRACING', title: 'Trace the numbers 1–5', instructions: 'Trace each number with your finger.', difficulty: 1, categories: ['GENERAL'],
    content: { items: ['1', '2', '3', '4', '5'], repeats: 1, guide: 'DOTTED', font: 'ROUND', lines: true } },
  { engine: 'TRACING', title: 'Arabic letters: ا ب ت ث', instructions: 'تتبّع الحروف بإصبعك', difficulty: 1, categories: ['GENERAL'],
    content: { items: ['ا', 'ب', 'ت', 'ث'], repeats: 1, guide: 'DOTTED', font: 'ROUND', lines: true } },
];
