import sqlite3
from werkzeug.security import generate_password_hash, check_password_hash
from flask import Flask, request, jsonify, session
from flask_cors import CORS
from datetime import datetime
import secrets
import json

app = Flask(__name__)
app.secret_key = secrets.token_hex(32)  # Generate secure secret key
CORS(app, supports_credentials=True, origins=['http://localhost:8084', 'http://127.0.0.1:8084'])

# Database initialization
def init_db():
    conn = sqlite3.connect("users.db")
    cursor = conn.cursor()
    
    # Users table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    # Search history table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS search_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        query TEXT NOT NULL,
        model_type TEXT NOT NULL,
        response TEXT,
        sources TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
    """)
    
    # Chat history table for persistent conversation storage
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS chat_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        model_type TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
    """)
    
    # Chat sessions table to track conversation sessions
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS chat_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        session_id TEXT UNIQUE NOT NULL,
        session_name TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
    """)
    
    conn.commit()
    conn.close()

init_db()

@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.json
    username = data.get('username', '').strip()
    email = data.get('email', '').strip()
    password = data.get('password', '')
    
    if not username or not email or not password:
        return jsonify({'error': 'All fields required'}), 400
    
    if len(password) < 8:
        return jsonify({'error': 'Password must be at least 8 characters'}), 400
    
    try:
        conn = sqlite3.connect("users.db")
        cursor = conn.cursor()
        
        # Hash password securely
        password_hash = generate_password_hash(password, method='pbkdf2:sha256')
        
        cursor.execute(
            "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)",
            (username, email, password_hash)
        )
        conn.commit()
        user_id = cursor.lastrowid
        conn.close()
        
        # Set session
        session['user_id'] = user_id
        session['username'] = username
        
        return jsonify({
            'success': True,
            'user': {'id': user_id, 'username': username, 'email': email}
        })
    
    except sqlite3.IntegrityError as e:
        if 'username' in str(e):
            return jsonify({'error': 'Username already exists'}), 409
        elif 'email' in str(e):
            return jsonify({'error': 'Email already registered'}), 409
        return jsonify({'error': 'Registration failed'}), 500

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username', '').strip()
    password = data.get('password', '')
    
    if not username or not password:
        return jsonify({'error': 'Username and password required'}), 400
    
    conn = sqlite3.connect("users.db")
    cursor = conn.cursor()
    
    cursor.execute(
        "SELECT id, username, email, password_hash FROM users WHERE username = ?",
        (username,)
    )
    user = cursor.fetchone()
    conn.close()
    
    if not user or not check_password_hash(user[3], password):
        return jsonify({'error': 'Invalid credentials'}), 401
    
    # Set session
    session['user_id'] = user[0]
    session['username'] = user[1]
    
    return jsonify({
        'success': True,
        'user': {'id': user[0], 'username': user[1], 'email': user[2]}
    })

@app.route('/api/auth/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'success': True})

@app.route('/api/auth/me', methods=['GET'])
def get_current_user():
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    conn = sqlite3.connect("users.db")
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, username, email FROM users WHERE id = ?",
        (session['user_id'],)
    )
    user = cursor.fetchone()
    conn.close()
    
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    return jsonify({
        'user': {'id': user[0], 'username': user[1], 'email': user[2]}
    })

@app.route('/api/history', methods=['POST'])
def save_history():
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    data = request.json
    query = data.get('query', '')
    model_type = data.get('model_type', 'researcher')
    response = data.get('response', '')
    sources = str(data.get('sources', []))
    
    conn = sqlite3.connect("users.db")
    cursor = conn.cursor()
    cursor.execute(
        """INSERT INTO search_history (user_id, query, model_type, response, sources)
           VALUES (?, ?, ?, ?, ?)""",
        (session['user_id'], query, model_type, response, sources)
    )
    conn.commit()
    conn.close()
    
    return jsonify({'success': True})

@app.route('/api/history', methods=['GET'])
def get_history():
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    conn = sqlite3.connect("users.db")
    cursor = conn.cursor()
    cursor.execute(
        """SELECT id, query, model_type, response, sources, timestamp
           FROM search_history WHERE user_id = ?
           ORDER BY timestamp DESC LIMIT 100""",
        (session['user_id'],)
    )
    
    history = []
    for row in cursor.fetchall():
        history.append({
            'id': row[0],
            'query': row[1],
            'model_type': row[2],
            'response': row[3],
            'sources': row[4],
            'timestamp': row[5]
        })
    
    conn.close()
    return jsonify({'history': history})

@app.route('/api/history/<int:history_id>', methods=['DELETE'])
def delete_history_item(history_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    conn = sqlite3.connect("users.db")
    cursor = conn.cursor()
    cursor.execute(
        "DELETE FROM search_history WHERE id = ? AND user_id = ?",
        (history_id, session['user_id'])
    )
    conn.commit()
    conn.close()
    
    return jsonify({'success': True})

@app.route('/api/history/clear', methods=['DELETE'])
def clear_history():
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    conn = sqlite3.connect("users.db")
    cursor = conn.cursor()
    cursor.execute(
        "DELETE FROM search_history WHERE user_id = ?",
        (session['user_id'],)
    )
    conn.commit()
    conn.close()
    
    return jsonify({'success': True})

# Chat History API Endpoints

@app.route('/api/chat/sessions', methods=['GET'])
def get_chat_sessions():
    """Get all chat sessions for the current user"""
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    conn = sqlite3.connect("users.db")
    cursor = conn.cursor()
    cursor.execute(
        """SELECT session_id, session_name, created_at, last_activity,
           (SELECT COUNT(*) FROM chat_history WHERE session_id = cs.session_id) as message_count
           FROM chat_sessions cs WHERE user_id = ?
           ORDER BY last_activity DESC""",
        (session['user_id'],)
    )
    
    sessions = []
    for row in cursor.fetchall():
        sessions.append({
            'session_id': row[0],
            'session_name': row[1] or f"Conversation {row[0][:8]}",
            'created_at': row[2],
            'last_activity': row[3],
            'message_count': row[4]
        })
    
    conn.close()
    return jsonify({'sessions': sessions})

@app.route('/api/chat/session/<session_id>', methods=['GET'])
def get_chat_session(session_id):
    """Get all messages for a specific chat session"""
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    conn = sqlite3.connect("users.db")
    cursor = conn.cursor()
    
    # Verify session belongs to user
    cursor.execute(
        "SELECT id FROM chat_sessions WHERE session_id = ? AND user_id = ?",
        (session_id, session['user_id'])
    )
    if not cursor.fetchone():
        return jsonify({'error': 'Session not found'}), 404
    
    # Get messages
    cursor.execute(
        """SELECT id, role, content, model_type, timestamp
           FROM chat_history WHERE session_id = ?
           ORDER BY timestamp ASC""",
        (session_id,)
    )
    
    messages = []
    for row in cursor.fetchall():
        messages.append({
            'id': row[0],
            'role': row[1],
            'content': row[2],
            'model_type': row[3],
            'timestamp': row[4]
        })
    
    conn.close()
    return jsonify({'messages': messages})

@app.route('/api/chat/session', methods=['POST'])
def save_chat_message():
    """Save a chat message to the database"""
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    data = request.json
    session_id = data.get('session_id')
    role = data.get('role')  # 'user' or 'assistant'
    content = data.get('content')
    model_type = data.get('model_type', 'researcher')
    
    if not session_id or not role or not content:
        return jsonify({'error': 'Missing required fields'}), 400
    
    conn = sqlite3.connect("users.db")
    cursor = conn.cursor()
    
    # Create or update session
    cursor.execute(
        """INSERT OR IGNORE INTO chat_sessions (user_id, session_id, created_at, last_activity)
           VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)""",
        (session['user_id'], session_id)
    )
    
    # Update last activity
    cursor.execute(
        "UPDATE chat_sessions SET last_activity = CURRENT_TIMESTAMP WHERE session_id = ?",
        (session_id,)
    )
    
    # Save message
    cursor.execute(
        """INSERT INTO chat_history (user_id, session_id, role, content, model_type)
           VALUES (?, ?, ?, ?, ?)""",
        (session['user_id'], session_id, role, content, model_type)
    )
    
    conn.commit()
    message_id = cursor.lastrowid
    conn.close()
    
    return jsonify({'success': True, 'message_id': message_id})

@app.route('/api/chat/session/<session_id>', methods=['DELETE'])
def delete_chat_session(session_id):
    """Delete a chat session and all its messages"""
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    conn = sqlite3.connect("users.db")
    cursor = conn.cursor()
    
    # Delete messages first (due to foreign key)
    cursor.execute(
        "DELETE FROM chat_history WHERE session_id = ? AND user_id = ?",
        (session_id, session['user_id'])
    )
    
    # Delete session
    cursor.execute(
        "DELETE FROM chat_sessions WHERE session_id = ? AND user_id = ?",
        (session_id, session['user_id'])
    )
    
    conn.commit()
    conn.close()
    
    return jsonify({'success': True})

@app.route('/api/chat/session/<session_id>/name', methods=['PUT'])
def update_session_name(session_id):
    """Update the name of a chat session"""
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    data = request.json
    session_name = data.get('session_name', '').strip()
    
    if not session_name:
        return jsonify({'error': 'Session name required'}), 400
    
    conn = sqlite3.connect("users.db")
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE chat_sessions SET session_name = ? WHERE session_id = ? AND user_id = ?",
        (session_name, session_id, session['user_id'])
    )
    conn.commit()
    conn.close()
    
    return jsonify({'success': True})

@app.route('/api/chat/export/<session_id>', methods=['GET'])
def export_chat_session(session_id):
    """Export a chat session as JSON"""
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    conn = sqlite3.connect("users.db")
    cursor = conn.cursor()
    
    # Get session info
    cursor.execute(
        """SELECT session_name, created_at, last_activity FROM chat_sessions
           WHERE session_id = ? AND user_id = ?""",
        (session_id, session['user_id'])
    )
    session_info = cursor.fetchone()
    
    if not session_info:
        return jsonify({'error': 'Session not found'}), 404
    
    # Get messages
    cursor.execute(
        """SELECT role, content, model_type, timestamp FROM chat_history
           WHERE session_id = ? ORDER BY timestamp ASC""",
        (session_id,)
    )
    
    messages = []
    for row in cursor.fetchall():
        messages.append({
            'role': row[0],
            'content': row[1],
            'model_type': row[2],
            'timestamp': row[3]
        })
    
    conn.close()
    
    export_data = {
        'session_info': {
            'session_id': session_id,
            'session_name': session_info[0] or f"Conversation {session_id[:8]}",
            'created_at': session_info[1],
            'last_activity': session_info[2],
            'total_messages': len(messages),
            'total_questions': len([m for m in messages if m['role'] == 'user'])
        },
        'messages': messages
    }
    
    return jsonify(export_data)

@app.route('/api/chat/clear-all', methods=['DELETE'])
def clear_all_chat_history():
    """Clear all chat history for the current user"""
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    conn = sqlite3.connect("users.db")
    cursor = conn.cursor()
    
    # Delete all messages
    cursor.execute(
        "DELETE FROM chat_history WHERE user_id = ?",
        (session['user_id'],)
    )
    
    # Delete all sessions
    cursor.execute(
        "DELETE FROM chat_sessions WHERE user_id = ?",
        (session['user_id'],)
    )
    
    conn.commit()
    conn.close()
    
    return jsonify({'success': True})

# Paper Summarization API Endpoint

@app.route('/api/papers/summarize', methods=['POST'])
def summarize_paper():
    """Generate a summary for a research paper"""
    try:
        data = request.json
        paper_title = data.get('paper_title', '').strip()
        
        if not paper_title:
            return jsonify({
                'success': False,
                'error': 'Paper title is required'
            }), 400
        
        # Generate a structured summary (placeholder implementation)
        # In a real implementation, this would call an external AI service or API
        summary_data = {
            'success': True,
            'paper_title': paper_title,
            'summary': f'This research paper examines the effects of microgravity conditions on biological systems. The study "{paper_title}" investigates how the absence of gravitational forces influences cellular processes, physiological adaptations, and molecular mechanisms. The research contributes to our understanding of space biology and has implications for long-duration spaceflight missions.',
            'key_findings': [
                'Microgravity significantly alters cellular behavior and gene expression patterns',
                'Physiological adaptations occur rapidly in weightless environments',
                'Countermeasures may be necessary to mitigate negative effects during spaceflight'
            ],
            'methodology': 'The study likely employed ground-based microgravity simulation facilities, flight experiments, or analysis of astronaut data to investigate the biological responses to weightless conditions.',
            'significance': 'This research is crucial for understanding how living organisms adapt to space environments and for developing strategies to maintain crew health during long-duration missions to Mars and beyond.',
            'generated_at': datetime.now().isoformat()
        }
        
        return jsonify(summary_data)
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Failed to generate summary: {str(e)}'
        }), 500

# Paper Search Suggestions API Endpoint

@app.route('/api/papers/suggestions', methods=['GET'])
def get_paper_suggestions():
    """Get paper title suggestions for autocomplete"""
    try:
        query = request.args.get('q', '').strip().lower()
        
        if len(query) < 2:
            return jsonify({'suggestions': []})
        
        # Sample paper suggestions (in a real implementation, this would query a database or API)
        sample_papers = [
            {'title': 'Effects of Microgravity on Plant Cell Wall Synthesis', 'authors': 'Smith, J. et al.', 'year': 2023},
            {'title': 'DNA Repair Mechanisms in Space Environment', 'authors': 'Johnson, A. et al.', 'year': 2022},
            {'title': 'Protein Crystallization Under Microgravity Conditions', 'authors': 'Brown, M. et al.', 'year': 2023},
            {'title': 'Bone Density Changes During Long-Duration Spaceflight', 'authors': 'Davis, K. et al.', 'year': 2021},
            {'title': 'Cardiovascular Adaptations to Microgravity', 'authors': 'Wilson, R. et al.', 'year': 2022},
            {'title': 'Neural Plasticity in Altered Gravitational Fields', 'authors': 'Garcia, L. et al.', 'year': 2023},
            {'title': 'Immune System Response to Space Radiation', 'authors': 'Taylor, S. et al.', 'year': 2022},
            {'title': 'Muscle Atrophy Prevention in Microgravity', 'authors': 'Anderson, P. et al.', 'year': 2021},
            {'title': 'Sleep Patterns and Circadian Rhythms in Space', 'authors': 'Martinez, C. et al.', 'year': 2023},
            {'title': 'Psychological Effects of Long-Duration Space Missions', 'authors': 'Thompson, D. et al.', 'year': 2022}
        ]
        
        # Filter suggestions based on query
        suggestions = []
        for paper in sample_papers:
            if query in paper['title'].lower() or query in paper['authors'].lower():
                suggestions.append(paper)
        
        # Limit to 5 suggestions
        suggestions = suggestions[:5]
        
        return jsonify({'suggestions': suggestions})
        
    except Exception as e:
        return jsonify({
            'suggestions': [],
            'error': f'Failed to get suggestions: {str(e)}'
        }), 500

# Quiz Generation API Endpoint

@app.route('/api/papers/quiz', methods=['POST'])
def generate_quiz():
    """Generate a quiz for a research paper"""
    try:
        data = request.json
        paper_title = data.get('paper_title', '').strip()
        
        if not paper_title:
            return jsonify({
                'success': False,
                'error': 'Paper title is required'
            }), 400
        
        # Generate a sample quiz (placeholder implementation)
        quiz_data = {
            'success': True,
            'paper_title': paper_title,
            'quiz': {
                'title': f'Quiz: {paper_title}',
                'questions': [
                    {
                        'id': 1,
                        'question': 'What is the primary focus of this research paper?',
                        'options': [
                            'Effects of microgravity on biological systems',
                            'Spacecraft propulsion mechanisms',
                            'Planetary geology studies',
                            'Solar radiation analysis'
                        ],
                        'correct_answer': 0,
                        'explanation': 'The paper focuses on how microgravity affects various biological processes and systems.'
                    },
                    {
                        'id': 2,
                        'question': 'Which research method is commonly used in microgravity studies?',
                        'options': [
                            'Computer simulations only',
                            'Ground-based microgravity simulation facilities',
                            'Theoretical analysis only',
                            'Historical data review'
                        ],
                        'correct_answer': 1,
                        'explanation': 'Ground-based microgravity simulation facilities allow researchers to study biological responses to weightless conditions.'
                    },
                    {
                        'id': 3,
                        'question': 'What is a key finding regarding cellular behavior in microgravity?',
                        'options': [
                            'Cells behave identically to Earth conditions',
                            'Cellular behavior and gene expression patterns are significantly altered',
                            'Only plant cells are affected',
                            'Changes are temporary and reversible'
                        ],
                        'correct_answer': 1,
                        'explanation': 'Research shows that microgravity significantly alters cellular behavior and gene expression patterns across various cell types.'
                    }
                ],
                'total_questions': 3
            },
            'generated_at': datetime.now().isoformat()
        }
        
        return jsonify(quiz_data)
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Failed to generate quiz: {str(e)}'
        }), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)

# Quiz and Search Suggestions API Endpoints

@app.route('/api/papers/search', methods=['GET'])
def search_papers():
    """Search for papers with suggestions"""
    query = request.args.get('q', '').strip()
    limit = min(int(request.args.get('limit', 10)), 50)
    
    if not query:
        return jsonify({'papers': []})
    
    # Sample papers database (in a real app, this would query a database)
    sample_papers = [
        {
            "title": "Effects of Microgravity on Plant Cell Wall Synthesis",
            "authors": ["Johnson, M.K.", "Smith, A.L.", "Brown, R.T."],
            "year": 2023,
            "doi": "10.1016/j.spaceres.2023.001",
            "abstract": "This study investigates how microgravity conditions affect the synthesis of plant cell walls...",
            "keywords": ["microgravity", "plant", "cell wall", "synthesis"]
        },
        {
            "title": "DNA Repair Mechanisms in Space Radiation Environment",
            "authors": ["Chen, L.", "Williams, P.D.", "Davis, K.M."],
            "year": 2022,
            "doi": "10.1038/s41526-022-0234-1",
            "abstract": "Space radiation poses significant challenges to DNA integrity. This research examines...",
            "keywords": ["DNA", "repair", "radiation", "space"]
        },
        {
            "title": "Bone Density Changes in Long-Duration Spaceflight",
            "authors": ["Anderson, J.R.", "Thompson, S.A.", "Miller, C.L."],
            "year": 2023,
            "doi": "10.1007/s00223-023-1089-4",
            "abstract": "Long-duration spaceflight results in significant bone density loss...",
            "keywords": ["bone", "density", "spaceflight", "astronaut"]
        },
        {
            "title": "Protein Crystallization in Microgravity Conditions",
            "authors": ["Garcia, M.E.", "Wilson, D.K.", "Taylor, B.J."],
            "year": 2021,
            "doi": "10.1107/S2059798321009834",
            "abstract": "Microgravity provides unique conditions for protein crystallization...",
            "keywords": ["protein", "crystallization", "microgravity"]
        },
        {
            "title": "Cardiovascular Adaptations to Zero Gravity",
            "authors": ["Lee, H.S.", "Martinez, R.C.", "Jackson, T.M."],
            "year": 2022,
            "doi": "10.1152/japplphysiol.00456.2022",
            "abstract": "The cardiovascular system undergoes significant adaptations in zero gravity...",
            "keywords": ["cardiovascular", "zero gravity", "adaptation"]
        },
        {
            "title": "Yeast Gene Expression Under Simulated Mars Conditions",
            "authors": ["Patel, N.K.", "Robinson, A.F.", "White, L.G."],
            "year": 2023,
            "doi": "10.1089/ast.2023.0045",
            "abstract": "This study examines how yeast gene expression changes under Mars-like conditions...",
            "keywords": ["yeast", "gene expression", "mars", "conditions"]
        },
        {
            "title": "Immune System Response to Extended Space Travel",
            "authors": ["Kumar, S.R.", "Adams, M.J.", "Clark, P.L."],
            "year": 2022,
            "doi": "10.3389/fimmu.2022.987654",
            "abstract": "Extended space travel significantly impacts immune system function...",
            "keywords": ["immune", "system", "space travel", "extended"]
        },
        {
            "title": "Muscle Atrophy Prevention Strategies in Microgravity",
            "authors": ["Brooks, K.A.", "Evans, D.R.", "Moore, J.S."],
            "year": 2023,
            "doi": "10.1113/JP284567",
            "abstract": "Muscle atrophy is a major concern in microgravity environments...",
            "keywords": ["muscle", "atrophy", "prevention", "microgravity"]
        }
    ]
    
    # Filter papers based on query
    query_lower = query.lower()
    matching_papers = []
    
    for paper in sample_papers:
        # Check if query matches title, authors, or keywords
        title_match = query_lower in paper['title'].lower()
        author_match = any(query_lower in author.lower() for author in paper['authors'])
        keyword_match = any(query_lower in keyword.lower() for keyword in paper['keywords'])
        
        if title_match or author_match or keyword_match:
            # Calculate relevance score
            score = 0
            if title_match:
                score += 3
            if author_match:
                score += 2
            if keyword_match:
                score += 1
            
            paper_copy = paper.copy()
            paper_copy['relevance_score'] = score
            matching_papers.append(paper_copy)
    
    # Sort by relevance score and limit results
    matching_papers.sort(key=lambda x: x['relevance_score'], reverse=True)
    matching_papers = matching_papers[:limit]
    
    return jsonify({
        'papers': matching_papers,
        'total': len(matching_papers),
        'query': query
    })

@app.route('/api/papers/suggestions', methods=['GET'])
def get_paper_suggestions():
    """Get paper title suggestions for autocomplete"""
    query = request.args.get('q', '').strip()
    limit = min(int(request.args.get('limit', 5)), 10)
    
    if not query or len(query) < 2:
        return jsonify({'suggestions': []})
    
    # Use the same sample papers for suggestions
    sample_papers = [
        {
            "title": "Effects of Microgravity on Plant Cell Wall Synthesis",
            "authors": "Johnson, M.K., Smith, A.L., Brown, R.T.",
            "year": 2023
        },
        {
            "title": "DNA Repair Mechanisms in Space Radiation Environment",
            "authors": "Chen, L., Williams, P.D., Davis, K.M.",
            "year": 2022
        },
        {
            "title": "Bone Density Changes in Long-Duration Spaceflight",
            "authors": "Anderson, J.R., Thompson, S.A., Miller, C.L.",
            "year": 2023
        },
        {
            "title": "Protein Crystallization in Microgravity Conditions",
            "authors": "Garcia, M.E., Wilson, D.K., Taylor, B.J.",
            "year": 2021
        },
        {
            "title": "Cardiovascular Adaptations to Zero Gravity",
            "authors": "Lee, H.S., Martinez, R.C., Jackson, T.M.",
            "year": 2022
        },
        {
            "title": "Yeast Gene Expression Under Simulated Mars Conditions",
            "authors": "Patel, N.K., Robinson, A.F., White, L.G.",
            "year": 2023
        },
        {
            "title": "Immune System Response to Extended Space Travel",
            "authors": "Kumar, S.R., Adams, M.J., Clark, P.L.",
            "year": 2022
        },
        {
            "title": "Muscle Atrophy Prevention Strategies in Microgravity",
            "authors": "Brooks, K.A., Evans, D.R., Moore, J.S.",
            "year": 2023
        }
    ]
    
    query_lower = query.lower()
    suggestions = []
    
    for paper in sample_papers:
        if query_lower in paper['title'].lower():
            suggestions.append(paper)
    
    # Sort by title length (shorter titles first for better UX)
    suggestions.sort(key=lambda x: len(x['title']))
    suggestions = suggestions[:limit]
    
    return jsonify({'suggestions': suggestions})

@app.route('/api/quiz/generate', methods=['POST'])
def generate_quiz():
    """Generate a quiz for a specific paper"""
    data = request.json
    paper_title = data.get('paper_title', '').strip()
    num_questions = min(int(data.get('num_questions', 5)), 10)
    
    if not paper_title:
        return jsonify({'error': 'Paper title is required'}), 400
    
    # In a real application, this would use an AI service to generate questions
    # For demo purposes, we'll return sample quiz questions
    sample_quiz = {
        "paper_title": paper_title,
        "questions": [
            {
                "question": f"What is the primary focus of the research paper '{paper_title}'?",
                "options": {
                    "A": "Investigating the effects of microgravity on biological processes",
                    "B": "Developing new space exploration technologies",
                    "C": "Analyzing atmospheric conditions on Mars",
                    "D": "Studying solar radiation patterns"
                },
                "correct": "A",
                "explanation": "The paper primarily focuses on biological processes and their response to space conditions."
            },
            {
                "question": "Which methodology was most likely used in this research?",
                "options": {
                    "A": "Theoretical modeling only",
                    "B": "Ground-based experiments with simulated conditions",
                    "C": "Observational studies from Earth",
                    "D": "Computer simulations exclusively"
                },
                "correct": "B",
                "explanation": "Most space biology research uses ground-based experiments that simulate space conditions."
            },
            {
                "question": "What are the potential applications of this research?",
                "options": {
                    "A": "Improving astronaut health during long missions",
                    "B": "Developing better spacecraft materials",
                    "C": "Enhancing communication systems",
                    "D": "Creating new propulsion technologies"
                },
                "correct": "A",
                "explanation": "Space biology research primarily aims to understand and mitigate the effects of space on living organisms."
            },
            {
                "question": "Which of the following is a common challenge in space biology research?",
                "options": {
                    "A": "Limited access to space-based experimental facilities",
                    "B": "Lack of funding for research projects",
                    "C": "Difficulty in replicating space conditions on Earth",
                    "D": "All of the above"
                },
                "correct": "D",
                "explanation": "Space biology research faces multiple challenges including limited access to space, funding constraints, and technical difficulties."
            },
            {
                "question": "What type of controls would be essential in this type of study?",
                "options": {
                    "A": "Earth gravity conditions as a baseline",
                    "B": "Different time intervals for observation",
                    "C": "Multiple biological specimens",
                    "D": "All of the above"
                },
                "correct": "D",
                "explanation": "Proper scientific methodology requires multiple types of controls to ensure valid results."
            }
        ]
    }
    
    # Limit to requested number of questions
    sample_quiz["questions"] = sample_quiz["questions"][:num_questions]
    
    return jsonify(sample_quiz)

@app.route('/api/quiz/submit', methods=['POST'])
def submit_quiz():
    """Submit quiz answers and get results"""
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    data = request.json
    paper_title = data.get('paper_title', '')
    answers = data.get('answers', {})  # {question_index: selected_option}
    
    if not paper_title or not answers:
        return jsonify({'error': 'Paper title and answers are required'}), 400
    
    # In a real app, this would validate against the actual quiz questions
    # For demo, we'll calculate a simple score
    total_questions = len(answers)
    correct_answers = 0
    
    # Sample correct answers (in real app, this would come from database)
    correct_answer_key = {0: 'A', 1: 'B', 2: 'A', 3: 'D', 4: 'D'}
    
    for question_index, user_answer in answers.items():
        question_idx = int(question_index)
        if question_idx in correct_answer_key and correct_answer_key[question_idx] == user_answer:
            correct_answers += 1
    
    score_percentage = (correct_answers / total_questions * 100) if total_questions > 0 else 0
    
    # Save quiz result to database (optional)
    try:
        conn = sqlite3.connect("users.db")
        cursor = conn.cursor()
        
        # Create quiz_results table if it doesn't exist
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS quiz_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            paper_title TEXT NOT NULL,
            score INTEGER NOT NULL,
            total_questions INTEGER NOT NULL,
            answers TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
        """)
        
        cursor.execute(
            """INSERT INTO quiz_results (user_id, paper_title, score, total_questions, answers)
               VALUES (?, ?, ?, ?, ?)""",
            (session['user_id'], paper_title, correct_answers, total_questions, json.dumps(answers))
        )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Error saving quiz result: {e}")
    
    return jsonify({
        'score': correct_answers,
        'total': total_questions,
        'percentage': round(score_percentage, 1),
        'passed': score_percentage >= 70
    })

@app.route('/api/quiz/history', methods=['GET'])
def get_quiz_history():
    """Get quiz history for the current user"""
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    try:
        conn = sqlite3.connect("users.db")
        cursor = conn.cursor()
        cursor.execute(
            """SELECT paper_title, score, total_questions, timestamp
               FROM quiz_results WHERE user_id = ?
               ORDER BY timestamp DESC LIMIT 50""",
            (session['user_id'],)
        )
        
        history = []
        for row in cursor.fetchall():
            percentage = (row[1] / row[2] * 100) if row[2] > 0 else 0
            history.append({
                'paper_title': row[0],
                'score': row[1],
                'total_questions': row[2],
                'percentage': round(percentage, 1),
                'timestamp': row[3]
            })
        
        conn.close()
        return jsonify({'history': history})
    except Exception as e:
        return jsonify({'error': 'Failed to load quiz history'}), 500
