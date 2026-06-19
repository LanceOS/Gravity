try {
  new URL('/api/auth');
  console.log("Success");
} catch(e) {
  console.log("Failed: " + e.message);
}
