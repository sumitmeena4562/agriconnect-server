async function testLogin() {
    try {
        const response = await fetch('http://127.0.0.1:5000/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                identifier: '6261652446',
                password: '@Sumit123'
            })
        });
        const data = await response.json();
        if (!response.ok) {
            console.error("ERROR:", data);
        } else {
            console.log("SUCCESS:", data);
        }
    } catch (error) {
        console.error("FETCH ERROR:", error);
    }
}

testLogin();
