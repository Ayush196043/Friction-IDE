from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from google import genai
from google.genai import types
import os, json, re, traceback
from dotenv import load_dotenv

load_dotenv(override=True)

app = Flask(__name__, static_folder='static', static_url_path='')
CORS(app)

def get_client():
    """Dynamically get GenAI client using the latest environment variables."""
    load_dotenv(override=True)
    key = os.getenv("GEMINI_API_KEY", "")
    if not key or key == 'your_gemini_api_key_here':
        return None, ""
    return genai.Client(api_key=key), key

SYSTEM_PROMPT = """You are an expert web developer. When given a prompt, you will either generate a COMPLETE website from scratch or MODIFY the existing code based on instructions.

You must follow these rules strictly:
1. MULTILINGUAL: Understand and respond to instructions in any language (Hinglish, Hindi, Spanish, etc.) but always return the final code structure in the specified JSON format.
2. MOBILE-FIRST: Use modern, responsive CSS (media queries, flexbox, grid). Always include <meta name="viewport" content="width=device-width, initial-scale=1.0">.
3. BEAUTIFUL: Use vibrant colors, glassmorphism, Google Fonts, and smooth animations (GSAP/CSS).
4. NO MARKDOWN: Return ONLY a valid JSON object. No backticks, no markdown blocks.

JSON Structure:
{
  "html": "...full HTML content (no <style> or <script> blocks, include link/script tags for style.css/script.js)...",
  "css": "...full CSS content...",
  "js": "...full JavaScript content...",
  "backend": "...(Optional) backend code..."
}

If you are modifying existing code, you MUST return the FULL content of all files, including unchanged parts, to ensure a functional project."""


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
    client, _ = get_client()
    return jsonify({'status': 'ok', 'api_key_set': client is not None})


@app.route('/api/generate', methods=['POST'])
def generate():
    try:
        data   = request.get_json()
        client, current_api_key = get_client()
        
        if not client:
            return jsonify({'error': 'GEMINI_API_KEY not set in .env file'}), 500
            
        print(f"Using API Key: {current_api_key[:8]}...{current_api_key[-4:]}")
        prompt = data.get('prompt', '').strip()
        current_files = data.get('current_files', {}) # {html, css, js, backend}

        if not prompt:
            return jsonify({'error': 'Prompt is required'}), 400

        # Construct contextual prompt if files exist
        full_user_prompt = prompt
        if current_files and any(current_files.values()):
            full_user_prompt = f"Existing Code Context:\n"
            for name, content in current_files.items():
                if content: full_user_prompt += f"--- FILE: {name} ---\n{content}\n"
            full_user_prompt += f"\n\nNew Instructions: {prompt}\n\nPlease modify the existing code according to these instructions and return the full updated files."

        models_to_try = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-2.5-pro', 'gemini-1.5-pro']
        last_error = None

        for model_name in models_to_try:
            try:
                print(f"🤖 Trying model: {model_name}...")
                response = client.models.generate_content(
                    model=model_name,
                    contents=full_user_prompt,
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

                print(f"✅ Success with model: {model_name}")
                return jsonify({
                    'html': html_code, 
                    'css': css_code, 
                    'js': js_code,
                    'backend': backend_code
                })

            except (json.JSONDecodeError, ValueError, KeyError) as e:
                # Model didn't return valid JSON — try next
                print(f"⚠️ Model {model_name} returned invalid format. Shifting...")
                last_error = Exception(f"Model {model_name} returned invalid JSON format: {e}")
                continue
            except Exception as e:
                last_error = e
                if '429' in str(e) or 'RESOURCE_EXHAUSTED' in str(e) or '404' in str(e):
                    print(f"🔄 Quota reached or model unavailable for {model_name}. Shifting to next model...")
                    continue
                raise e

        return jsonify({'error': f'Generation failed: {last_error}'}), 500

    except Exception as e:
        traceback.print_exc()
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
