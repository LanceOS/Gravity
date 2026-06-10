

async function test() {
  try {
    const res = await fetch('http://localhost:8080/api/v1/labels', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Project-Id': 'p-test'
      },
      body: JSON.stringify({ name: 'test' })
    });
    console.log(res.status);
    console.log(await res.text());
  } catch (e) {
    console.error(e);
  }
}

test();
