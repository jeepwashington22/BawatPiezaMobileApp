try {
  const cs = require('./node_modules/expo-vector-icons/build/createIconSet');
  console.log('Success: createIconSet required');
} catch (e) {
  console.error('Failed:', e.message);
}