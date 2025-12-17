const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const app = express();
const PORT = process.env.PORT || 3000;

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'ntandostore-secret-key-2024';

// Multi-domain configuration
const SUPPORTED_DOMAINS = [
  'ntandostore',
  'ntando.app',
  'ntando.cloud',
  'ntando.zw',
  'ntl.cloud',
  'ntl.ai',
  'ntando.tech',
  'ntando.dev',
  'ntando.host',
  'ntando.site'
];

// Default primary domain
const PRIMARY_DOMAIN = 'ntandostore';

// Ensure JWT_SECRET is set in production
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('JWT_SECRET environment variable is required in production');
  console.error('Please set JWT_SECRET in your Render.com environment variables');
  console.warn('⚠️  Using fallback JWT_SECRET - PLEASE SET PROPERLY IN RENDER DASHBOARD!');
  process.env.JWT_SECRET = 'ntandostore-emergency-fallback-' + Date.now();
}

// Ensure directories exist
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const USERS_DIR = path.join(__dirname, 'users');
const DOMAINS_FILE = path.join(__dirname, 'domains.json');
const USERS_FILE = path.join(__dirname, 'users.json');

// Create directories if they don't exist
async function ensureDirectories() {
  try {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
    await fs.mkdir(USERS_DIR, { recursive: true });
    
    // Initialize files if they don't exist
    try {
      await fs.access(DOMAINS_FILE);
    } catch {
      await fs.writeFile(DOMAINS_FILE, JSON.stringify({}));
    }
    
    try {
      await fs.access(USERS_FILE);
    } catch {
      await fs.writeFile(USERS_FILE, JSON.stringify({}));
    }
  } catch (error) {
    console.error('Error creating directories:', error);
  }
}

// Initialize directories on startup
ensureDirectories();

// Middleware
app.use(express.static('public'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve uploaded files
app.use('/hosted', express.static(UPLOADS_DIR));
app.use('/users', express.static(USERS_DIR));

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Generate site URLs for all supported domains
function generateSiteUrls(userSubdomain, siteSlug) {
  const urls = {};
  
  SUPPORTED_DOMAINS.forEach(domain => {
    urls[domain] = `https://${userSubdomain}-${siteSlug}.${domain}`;
  });
  
  return urls;
}

// Generate unique subdomain
function generateSubdomain(username) {
  const adjectives = ['quick', 'bright', 'clever', 'swift', 'smart', 'happy', 'lucky', 'sunny', 'cool', 'warm'];
  const nouns = ['site', 'web', 'page', 'space', 'zone', 'hub', 'spot', 'place', 'world', 'realm'];
  const numbers = Math.floor(Math.random() * 9999) + 1;
  
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  
  return `${username}-${adjective}${noun}${numbers}`;
}

// Validate username
function validateUsername(username) {
  const validPattern = /^[a-zA-Z0-9_-]+$/;
  if (!validPattern.test(username)) {
    return false;
  }
  
  if (username.length < 3 || username.length > 30) {
    return false;
  }
  
  if (username.startsWith('-') || username.endsWith('-') || username.startsWith('_') || username.endsWith('_')) {
    return false;
  }
  
  const reserved = ['www', 'api', 'admin', 'dashboard', 'mail', 'ftp', 'cdn', 'static', 'assets', 'hosted', 'users'];
  if (reserved.includes(username.toLowerCase())) {
    return false;
  }
  
  return true;
}

// Validate subdomain
function validateSubdomain(subdomain) {
  const validPattern = /^[a-zA-Z0-9-]+$/;
  if (!validPattern.test(subdomain)) {
    return false;
  }
  
  if (subdomain.length < 3 || subdomain.length > 63) {
    return false;
  }
  
  if (subdomain.startsWith('-') || subdomain.endsWith('-')) {
    return false;
  }
  
  return true;
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Dashboard route
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Get supported domains
app.get('/api/domains', (req, res) => {
  res.json({
    supportedDomains: SUPPORTED_DOMAINS,
    primaryDomain: PRIMARY_DOMAIN
  });
});

// User registration
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    if (!validateUsername(username)) {
      return res.status(400).json({ error: 'Invalid username. Use 3-30 characters, letters, numbers, hyphens, and underscores only.' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }
    
    // Read existing users
    let users = {};
    try {
      const usersData = await fs.readFile(USERS_FILE, 'utf8');
      users = JSON.parse(usersData);
    } catch (error) {
      // File doesn't exist or is empty
    }
    
    // Check if username or email already exists
    if (Object.values(users).some(user => user.username === username)) {
      return res.status(400).json({ error: 'Username already taken' });
    }
    
    if (Object.values(users).some(user => user.email === email)) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = crypto.randomUUID();
    
    // Create user
    const user = {
      id: userId,
      username,
      email,
      password: hashedPassword,
      createdAt: new Date().toISOString(),
      subdomain: generateSubdomain(username),
      sites: []
    };
    
    users[userId] = user;
    await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
    
    // Create user directory
    const userDir = path.join(USERS_DIR, user.subdomain);
    await fs.mkdir(userDir, { recursive: true });
    
    // Generate JWT token
    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    
    res.json({ 
      success: true, 
      message: 'User registered successfully',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        subdomain: user.subdomain
      }
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// User login
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    // Read users
    let users = {};
    try {
      const usersData = await fs.readFile(USERS_FILE, 'utf8');
      users = JSON.parse(usersData);
    } catch (error) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    
    // Find user
    const user = Object.values(users).find(u => u.username === username);
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    
    // Verify password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    
    // Generate JWT token
    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    
    res.json({ 
      success: true, 
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        subdomain: user.subdomain
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get available templates
app.get('/api/templates', (req, res) => {
  const templates = [
    {
      id: 'portfolio',
      name: 'Portfolio Website',
      description: 'Clean portfolio template for showcasing your work',
      category: 'portfolio',
      html: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My Portfolio</title>
<script src="https://sites.super.myninja.ai/_assets/ninja-daytona-script.js"></script>
</head>
<body>
    <header>
        <nav>
            <h1>John Doe</h1>
            <ul>
                <li><a href="#about">About</a></li>
                <li><a href="#projects">Projects</a></li>
                <li><a href="#contact">Contact</a></li>
            </ul>
        </nav>
    </header>
    <main>
        <section id="hero">
            <h2>Web Developer & Designer</h2>
            <p>Creating beautiful and functional web experiences</p>
        </section>
        <section id="about">
            <h2>About Me</h2>
            <p>I'm a passionate developer with expertise in modern web technologies.</p>
        </section>
        <section id="projects">
            <h2>Projects</h2>
            <div class="project-grid">
                <div class="project">
                    <h3>Project 1</h3>
                    <p>Amazing web application</p>
                </div>
                <div class="project">
                    <h3>Project 2</h3>
                    <p>Another awesome project</p>
                </div>
            </div>
        </section>
    </main>
</body>
</html>`,
      css: `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
header { background: #2c3e50; color: white; padding: 1rem 0; position: fixed; width: 100%; top: 0; }
nav { display: flex; justify-content: space-between; align-items: center; max-width: 1200px; margin: 0 auto; padding: 0 2rem; }
nav ul { display: flex; list-style: none; gap: 2rem; }
nav a { color: white; text-decoration: none; }
main { margin-top: 80px; padding: 2rem; max-width: 1200px; margin-left: auto; margin-right: auto; }
#hero { text-align: center; padding: 4rem 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; margin: -2rem -2rem 2rem -2rem; }
.project-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2rem; margin-top: 2rem; }
.project { padding: 2rem; border: 1px solid #ddd; border-radius: 8px; }`
    },
    {
      id: 'business',
      name: 'Business Website',
      description: 'Professional business template',
      category: 'business',
      html: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My Business</title>
<script src="https://sites.super.myninja.ai/_assets/ninja-daytona-script.js"></script>
</head>
<body>
    <header>
        <nav>
            <div class="logo">BusinessName</div>
            <ul>
                <li><a href="#home">Home</a></li>
                <li><a href="#services">Services</a></li>
                <li><a href="#about">About</a></li>
                <li><a href="#contact">Contact</a></li>
            </ul>
        </nav>
    </header>
    <main>
        <section id="home">
            <h1>Welcome to Our Business</h1>
            <p>We provide exceptional services to help you succeed</p>
            <button>Get Started</button>
        </section>
        <section id="services">
            <h2>Our Services</h2>
            <div class="services-grid">
                <div class="service">
                    <h3>Service 1</h3>
                    <p>Professional service description</p>
                </div>
                <div class="service">
                    <h3>Service 2</h3>
                    <p>Another great service we offer</p>
                </div>
            </div>
        </section>
    </main>
</body>
</html>`,
      css: `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Segoe UI', sans-serif; line-height: 1.6; }
header { background: white; box-shadow: 0 2px 5px rgba(0,0,0,0.1); position: fixed; width: 100%; top: 0; z-index: 1000; }
nav { display: flex; justify-content: space-between; align-items: center; max-width: 1200px; margin: 0 auto; padding: 1rem 2rem; }
.logo { font-size: 1.5rem; font-weight: bold; color: #2c3e50; }
nav ul { display: flex; list-style: none; gap: 2rem; }
nav a { color: #333; text-decoration: none; font-weight: 500; }
main { margin-top: 80px; }
#home { text-align: center; padding: 6rem 2rem; background: linear-gradient(135deg, #74b9ff, #0984e3); color: white; }
#home h1 { font-size: 3rem; margin-bottom: 1rem; }
#services { padding: 4rem 2rem; max-width: 1200px; margin: 0 auto; }
.services-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2rem; margin-top: 2rem; }
.service { text-align: center; padding: 2rem; border-radius: 8px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); }
button { background: #0984e3; color: white; border: none; padding: 1rem 2rem; font-size: 1.1rem; border-radius: 5px; cursor: pointer; margin-top: 1rem; }`
    }
  ];
  
  res.json(templates);
});

// Upload and create a new site (protected route)
app.post('/api/upload', authenticateToken, async (req, res) => {
  try {
    const { html, css, js, siteName, siteSlug, favicon, preferredDomain } = req.body;
    
    if (!html) {
      return res.status(400).json({ error: 'HTML content is required' });
    }

    // Get user info
    let users = {};
    try {
      const usersData = await fs.readFile(USERS_FILE, 'utf8');
      users = JSON.parse(usersData);
    } catch (error) {
      return res.status(500).json({ error: 'User data not found' });
    }

    const user = users[req.user.userId];
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Generate site slug if not provided
    let slug = siteSlug;
    if (!slug) {
      slug = siteName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'site';
    }

    // Validate slug
    if (!validateSubdomain(slug)) {
      return res.status(400).json({ error: 'Invalid site name. Use 3-63 characters, letters, numbers, and hyphens only.' });
    }

    // Ensure unique slug within user's subdomain
    let finalSlug = slug;
    let counter = 1;
    while (user.sites.some(site => site.slug === finalSlug)) {
      finalSlug = `${slug}-${counter}`;
      counter++;
    }

    // Create site directory
    const userSubdomain = user.subdomain;
    const siteDir = path.join(USERS_DIR, userSubdomain, finalSlug);
    await fs.mkdir(siteDir, { recursive: true });

    // Create index.html with favicon if provided
    let fullHtml = html;
    
    if (favicon) {
      fullHtml = fullHtml.replace('<head>', `<head>\n    <link rel="icon" href="data:image/x-icon;base64,${favicon}">`);
    }
    
    if (css) {
      fullHtml = fullHtml.replace('</head>', `<style>${css}</style></head>`);
    }
    
    if (js) {
      fullHtml = fullHtml.replace('</body>', `<script>${js}</script></body>`);
    }

    await fs.writeFile(path.join(siteDir, 'index.html'), fullHtml);

    // Generate URLs for all domains
    const urls = generateSiteUrls(userSubdomain, finalSlug);
    const selectedDomain = preferredDomain || PRIMARY_DOMAIN;

    // Add site to user's sites
    const site = {
      id: crypto.randomUUID(),
      name: siteName || 'Untitled Site',
      slug: finalSlug,
      domain: selectedDomain,
      urls: urls,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      visits: 0,
      published: true
    };

    user.sites.push(site);
    await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));

    res.json({ 
      success: true, 
      slug: finalSlug,
      url: urls[selectedDomain],
      urls: urls,
      domain: selectedDomain,
      primaryUrl: urls[PRIMARY_DOMAIN],
      message: 'Site published successfully!',
      site
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload site' });
  }
});

// Get user's sites (protected route)
app.get('/api/user/sites', authenticateToken, async (req, res) => {
  try {
    // Get user info
    let users = {};
    try {
      const usersData = await fs.readFile(USERS_FILE, 'utf8');
      users = JSON.parse(usersData);
    } catch (error) {
      return res.json([]);
    }

    const user = users[req.user.userId];
    if (!user) {
      return res.json([]);
    }

    const sites = user.sites.map(site => ({
      ...site,
      url: site.urls[site.domain] || site.urls[PRIMARY_DOMAIN],
      primaryUrl: site.urls[PRIMARY_DOMAIN]
    }));

    res.json(sites);
  } catch (error) {
    console.error('Error loading sites:', error);
    res.json([]);
  }
});

// Health check endpoint for render.com
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    service: 'Ntandostore Enhanced Multi-Domain Hosting',
    features: ['Multi-Domain Support', 'Subdomains', 'User System', 'Site Editing', 'Templates'],
    supportedDomains: SUPPORTED_DOMAINS,
    primaryDomain: PRIMARY_DOMAIN,
    timestamp: new Date().toISOString() 
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Ntandostore Enhanced Multi-Domain Hosting running on port ${PORT}`);
  console.log(`📁 Uploads directory: ${UPLOADS_DIR}`);
  console.log(`👥 Users directory: ${USERS_DIR}`);
  console.log(`🌐 Dashboard: http://localhost:${PORT}/dashboard`);
  console.log(`🌐 Supported domains: ${SUPPORTED_DOMAINS.join(', ')}`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`✨ Features: Multi-domain support, subdomains, user system, site editing, templates, backups`);
  
  if (process.env.NODE_ENV === 'production') {
    console.log(`📂 Production directories:`);
    console.log(`   - Uploads: ${UPLOADS_DIR}`);
    console.log(`   - Users: ${USERS_DIR}`);
    console.log(`   - Domains: ${DOMAINS_FILE}`);
    console.log(`   - User DB: ${USERS_FILE}`);
    console.log(`🌐 Ready for production traffic on all supported domains`);
  }
});