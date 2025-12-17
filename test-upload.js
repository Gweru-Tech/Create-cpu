const fetch = require('node-fetch');

async function testUpload() {
    console.log('🧪 Testing Upload Flow...');
    
    try {
        // Step 1: Register a test user
        console.log('1. Registering test user...');
        const registerResponse = await fetch('http://localhost:3001/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: 'uploadtest',
                email: 'uploadtest@example.com',
                password: 'testpass123'
            })
        });
        
        const registerData = await registerResponse.json();
        if (!registerData.success) {
            throw new Error('Registration failed: ' + registerData.error);
        }
        
        console.log('✅ User registered successfully');
        const token = registerData.token;
        
        // Step 2: Test upload with all required fields
        console.log('2. Testing site upload...');
        const uploadResponse = await fetch('http://localhost:3001/api/upload', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                html: '<!DOCTYPE html><html><head><title>Test Upload</title></head><body><h1>Upload Test Success!</h1><p>This site was uploaded successfully.</p></body></html>',
                css: 'body { font-family: Arial, sans-serif; background: #f0f0f0; } h1 { color: #667eea; }',
                js: 'console.log("Upload test successful!");',
                siteName: 'Upload Test Site',
                siteSlug: 'upload-test',
                preferredDomain: 'ntandostore'
            })
        });
        
        const uploadData = await uploadResponse.json();
        if (!uploadData.success) {
            throw new Error('Upload failed: ' + uploadData.error);
        }
        
        console.log('✅ Upload successful!');
        console.log('📁 Site URL:', uploadData.primaryUrl);
        console.log('🌐 All domains:', Object.keys(uploadData.urls).length);
        
        // Step 3: Verify site was created
        console.log('3. Verifying site creation...');
        const sitesResponse = await fetch('http://localhost:3001/api/user/sites', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const sitesData = await sitesResponse.json();
        if (sitesData.length === 0) {
            throw new Error('No sites found after upload');
        }
        
        console.log('✅ Site found in user sites list');
        console.log('📊 Site name:', sitesData[0].name);
        console.log('🔗 Site URL:', sitesData[0].url);
        
        console.log('🎉 All tests passed! Upload functionality is working correctly.');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    }
}

testUpload();