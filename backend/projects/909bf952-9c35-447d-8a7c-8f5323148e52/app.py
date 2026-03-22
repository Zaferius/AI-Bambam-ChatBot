from flask import Flask, request, send_file
from PIL import Image
import os

app = Flask(__name__)

@app.route('/convert', methods=['POST'])
def convert():
    if 'file' not in request.files:
        return "No file part", 400
    file = request.files['file']
    if file.filename == '':
        return "No selected file", 400
    
    img = Image.open(file)
    png_filename = f"{os.path.splitext(file.filename)[0]}.png"
    img.save(png_filename, 'PNG')
    
    return send_file(png_filename, as_attachment=True)

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=5000)