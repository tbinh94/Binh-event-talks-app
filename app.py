import os
import re
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET
from datetime import datetime
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

# In-memory cache
cached_releases = None
cache_time = None
CACHE_DURATION_SECS = 3600  # Cache for 1 hour

FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"
ATOM_NAMESPACE = {"atom": "http://www.w3.org/2005/Atom"}

def parse_items_from_html(content_html):
    """
    Parses categories (<h3>Feature</h3>, <h3>Issue</h3>, etc.) and their descriptions
    from the Atom entry content HTML.
    """
    if not content_html:
        return []
        
    # Pattern to match <h3>Category</h3> followed by HTML content until the next <h3> or end of string
    pattern = re.compile(r'<h3>(.*?)</h3>(.*?)(?=<h3>|$)', re.DOTALL | re.IGNORECASE)
    items = []
    
    matches = list(pattern.finditer(content_html))
    
    for match in matches:
        category = match.group(1).strip()
        description = match.group(2).strip()
        
        # Clean up description (remove empty paragraphs, extra whitespace)
        description = re.sub(r'^\s*<p>\s*</p>\s*$', '', description, flags=re.MULTILINE)
        
        items.append({
            "category": category,
            "description": description
        })
        
    # Fallback if no <h3> tags were found in the HTML content
    if not items and content_html.strip():
        items.append({
            "category": "Announcement",
            "description": content_html.strip()
        })
        
    return items

def fetch_and_parse_feed():
    """
    Fetches the BigQuery XML feed and parses it into a structured Python dictionary list.
    """
    try:
        # Use urllib to fetch the feed
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        req = urllib.request.Request(FEED_URL, headers=headers)
        
        with urllib.request.urlopen(req, timeout=15) as response:
            xml_data = response.read()
            
        # Parse XML
        root = ET.fromstring(xml_data)
        
        releases = []
        
        # Extract title and link of the feed
        feed_title = root.find("atom:title", ATOM_NAMESPACE)
        feed_title_text = feed_title.text if feed_title is not None else "BigQuery Release Notes"
        
        for entry in root.findall("atom:entry", ATOM_NAMESPACE):
            title_elem = entry.find("atom:title", ATOM_NAMESPACE)
            date_str = title_elem.text if title_elem is not None else "Unknown Date"
            
            id_elem = entry.find("atom:id", ATOM_NAMESPACE)
            entry_id = id_elem.text if id_elem is not None else ""
            
            updated_elem = entry.find("atom:updated", ATOM_NAMESPACE)
            updated_str = updated_elem.text if updated_elem is not None else ""
            
            # Find alternate link
            link = ""
            for l in entry.findall("atom:link", ATOM_NAMESPACE):
                if l.attrib.get("rel") == "alternate" or not l.attrib.get("rel"):
                    link = l.attrib.get("href", "")
                    break
            
            content_elem = entry.find("atom:content", ATOM_NAMESPACE)
            content_html = content_elem.text if content_elem is not None else ""
            
            # Parse individual items from the HTML content
            items = parse_items_from_html(content_html)
            
            releases.append({
                "date": date_str,
                "updated": updated_str,
                "link": link,
                "id": entry_id,
                "items": items
            })
            
        return {
            "success": True,
            "feed_title": feed_title_text,
            "last_updated": datetime.now().isoformat(),
            "releases": releases
        }
        
    except urllib.error.URLError as e:
        return {
            "success": False,
            "error": f"Network error fetching feed: {str(e)}"
        }
    except ET.ParseError as e:
        return {
            "success": False,
            "error": f"XML parsing error: {str(e)}"
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"Unexpected error: {str(e)}"
        }

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/releases")
def get_releases():
    global cached_releases, cache_time
    
    force_refresh = request.args.get("refresh", "false").lower() == "true"
    now = datetime.now()
    
    # Determine if cache needs to be refreshed
    should_refresh = (
        force_refresh or
        cached_releases is None or
        cache_time is None or
        (now - cache_time).total_seconds() > CACHE_DURATION_SECS
    )
    
    if should_refresh:
        result = fetch_and_parse_feed()
        if result["success"]:
            cached_releases = result
            cache_time = now
        else:
            # If fetch fails but we have cached data, return cached data with warning
            if cached_releases:
                cached_releases["warning"] = f"Failed to refresh. Showing cached data. Error: {result['error']}"
                return jsonify(cached_releases)
            return jsonify(result), 500
            
    return jsonify(cached_releases)

if __name__ == "__main__":
    app.run(debug=True, host="127.0.0.1", port=5000)
