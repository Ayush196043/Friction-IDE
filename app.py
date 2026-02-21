from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from google import genai
from google.genai import types
import os, json, re
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__, static_folder='static', static_url_path='')
CORS(app)

api_key = os.getenv("GEMINI_API_KEY", "")
client = genai.Client(api_key=api_key) if api_key and api_key != 'your_gemini_api_key_here' else None

SYSTEM_PROMPT = """You are an expert web developer. When given a prompt, generate a COMPLETE, BEAUTIFUL, and FULLY FUNCTIONAL website split into THREE separate files.

Return ONLY a valid JSON object with exactly these three keys:
{
  "html": "...full HTML content (no <style> or <script> blocks, just structure)...",
  "css": "...full CSS content...",
  "js": "...full JavaScript content..."
}

Rules:
- The HTML must NOT include <style> or <script> tags — those go in the separate css/js keys.
- The HTML must include: <link rel="stylesheet" href="style.css"> in <head> and <script src="script.js"></script> before </body>.
- Make designs stunning, modern, and visually impressive with smooth animations.
- Use Google Fonts via @import in CSS, gradient backgrounds, glassmorphism effects.
- Make it fully responsive for mobile and desktop.
- Use vibrant colors and premium UI design.
- Return ONLY the JSON object. No markdown, no ```json blocks, no explanation."""


def extract_json(text: str) -> dict:
    """Robustly extract JSON from model response, even if wrapped in markdown."""
    text = text.strip()
    # Strip markdown code fences
    text = re.sub(r'^```(?:json)?\s*', '', text)
    text = re.sub(r'\s*```$', '', text)
    text = text.strip()
    return json.loads(text)


@app.route('/')
def index():
    return send_from_directory('static', 'index.html')


@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'api_key_set': client is not None})


@app.route('/api/generate', methods=['POST'])
def generate():
    try:
        data   = request.get_json()
        prompt = data.get('prompt', '').strip()

        if not prompt:
            return jsonify({'error': 'Prompt is required'}), 400

        if not client:
            return jsonify({'error': 'GEMINI_API_KEY not set in .env file'}), 500

        models_to_try = ['models/gemini-2.5-flash', 'models/gemini-2.0-flash', 'models/gemini-2.5-pro']
        last_error = None

        for model_name in models_to_try:
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        system_instruction=SYSTEM_PROMPT,
                        temperature=0.7,
                        max_output_tokens=65536,
                    )
                )

                parsed = extract_json(response.text)

                html_code    = parsed.get('html', '').strip()
                css_code     = parsed.get('css',  '').strip()
                js_code      = parsed.get('js',   '').strip()
                backend_code = parsed.get('backend', '').strip()

                if not html_code:
                    raise ValueError("AI returned empty HTML")

                return jsonify({
                    'html': html_code, 
                    'css': css_code, 
                    'js': js_code,
                    'backend': backend_code
                })

            except (json.JSONDecodeError, ValueError, KeyError):
                # Model didn't return valid JSON — try next
                last_error = Exception("Model returned invalid JSON format")
                continue
            except Exception as e:
                last_error = e
                if '429' in str(e) or 'RESOURCE_EXHAUSTED' in str(e) or '404' in str(e):
                    continue
                raise e

        return jsonify({'error': f'Generation failed: {last_error}'}), 500

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/save', methods=['POST'])
def save():
    """Save HTML + CSS + JS + (Optional) Backend as separate linked files."""
    try:
        data      = request.get_json()
        html      = data.get('html', '')
        css       = data.get('css',  '')
        js        = data.get('js',   '')
        backend   = data.get('backend', '')
        b_type    = data.get('backend_type', '') # 'flask' or 'node'
        project   = data.get('project_name', 'my_website')

        # Sanitize folder name
        project = re.sub(r'[^a-zA-Z0-9_\-]', '_', os.path.basename(project))
        if not project:
            project = 'my_website'

        folder = os.path.join(os.getcwd(), 'generated', project)
        os.makedirs(folder, exist_ok=True)

        with open(os.path.join(folder, 'index.html'), 'w', encoding='utf-8') as f:
            f.write(html)
        with open(os.path.join(folder, 'style.css'), 'w', encoding='utf-8') as f:
            f.write(css)
        with open(os.path.join(folder, 'script.js'), 'w', encoding='utf-8') as f:
            f.write(js)
        
        if backend:
            b_name = 'server.js' if b_type == 'node' else 'server.py'
            with open(os.path.join(folder, b_name), 'w', encoding='utf-8') as f:
                f.write(backend)

        return jsonify({'success': True, 'path': folder})

    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    print("⚡ Friction IDE running at http://localhost:5000")
    app.run(debug=True, port=5000)
