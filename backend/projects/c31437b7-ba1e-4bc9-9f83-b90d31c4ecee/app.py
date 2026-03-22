from flask import Flask, request, send_file
from PIL import Image
import os

app = Flask(__name__)

@app.route('/convert', methods=['POST'])
def convert_image():
    file = request.files['file']
    format = request.form.get('format')

    img = Image.open(file)

    output_file = f"output.{format}"
    img.save(output_file, format=format.upper())

    return send_file(output_file, as_attachment=True)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)