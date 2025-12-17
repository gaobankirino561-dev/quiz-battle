import zipfile
import xml.etree.ElementTree as ET
import sys
import os

def extract_text_from_docx(docx_path):
    try:
        with zipfile.ZipFile(docx_path) as zf:
            xml_content = zf.read('word/document.xml')
        
        tree = ET.fromstring(xml_content)
        namespace = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
        
        text = []
        for p in tree.iterfind('.//w:p', namespace):
            paragraph_text = []
            for t in p.iterfind('.//w:t', namespace):
                if t.text:
                    paragraph_text.append(t.text)
            if paragraph_text:
                text.append(''.join(paragraph_text))
            else:
                text.append('') # Preserve empty lines for structure
                
        return '\n'.join(text)
    except Exception as e:
        return f"Error: {str(e)}"

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python extract_docx_text.py <docx_file>")
        sys.exit(1)
        
    docx_file = sys.argv[1]
    if not os.path.exists(docx_file):
        print(f"File not found: {docx_file}")
        sys.exit(1)
        
    output_file = sys.argv[2] if len(sys.argv) > 2 else "extracted_text.txt"
    with open(output_file, "w", encoding="utf-8") as f:
        f.write(extract_text_from_docx(docx_file))
    print(f"Successfully wrote to {output_file}")
