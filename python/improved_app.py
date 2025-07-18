from flask import Flask, jsonify, request
from flask_cors import CORS
import requests
import time
import logging
from typing import Dict, List, Any, Optional
import xml.etree.ElementTree as ET

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

class PaperSearchService:
    """Enhanced paper search service with multiple fallbacks"""
    
    def __init__(self):
        self.cache = {}
        self.cache_duration = 3600  # 1 hour
    
    def search_papers(self, query: str, limit: int = 10) -> Dict[str, Any]:
        """Search for papers using multiple sources with fallbacks"""
        
        # Check cache first
        cache_key = f"{query.lower()}_{limit}"
        if cache_key in self.cache:
            cached_result = self.cache[cache_key]
            if time.time() - cached_result['timestamp'] < self.cache_duration:
                logger.info(f"Returning cached results for: {query}")
                return cached_result['data']
        
        # Try OpenAlex API first (most reliable)
        try:
            result = self._search_with_openalex(query, limit)
            if result['success']:
                self._cache_result(cache_key, result)
                return result
        except Exception as e:
            logger.warning(f"OpenAlex failed: {e}")
        
        # Fallback to arXiv
        try:
            result = self._search_with_arxiv(query, limit)
            if result['success']:
                self._cache_result(cache_key, result)
                return result
        except Exception as e:
            logger.warning(f"arXiv failed: {e}")
        
        # If all methods fail, return error with suggestions
        return {
            'success': False,
            'error': 'All search methods failed',
            'suggestions': [
                'Check your internet connection',
                'Try more specific search terms',
                'Verify search services are available'
            ],
            'papers': []
        }
    
    def _search_with_openalex(self, query: str, limit: int) -> Dict[str, Any]:
        """Search using OpenAlex API"""
        try:
            url = "https://api.openalex.org/works"
            params = {
                'search': query,
                'per-page': limit,
                'mailto': 'research@example.com'
            }
            
            response = requests.get(url, params=params, timeout=30)
            response.raise_for_status()
            
            data = response.json()
            papers = []
            
            for work in data.get('results', []):
                paper = {
                    'id': work.get('id', ''),
                    'title': work.get('title', 'No title'),
                    'authors': [author.get('display_name', '') for author in work.get('authorships', [])],
                    'abstract': self._get_abstract_from_inverted(work.get('abstract_inverted_index', {})),
                    'year': work.get('publication_year', ''),
                    'journal': work.get('primary_location', {}).get('source', {}).get('display_name', ''),
                    'url': work.get('doi', work.get('id', '')),
                    'citations': work.get('cited_by_count', 0),
                    'source': 'openalex'
                }
                papers.append(paper)
            
            return {
                'success': True,
                'source': 'openalex',
                'count': len(papers),
                'papers': papers
            }
            
        except Exception as e:
            raise Exception(f"OpenAlex search failed: {str(e)}")
    
    def _search_with_arxiv(self, query: str, limit: int) -> Dict[str, Any]:
        """Search using arXiv API"""
        try:
            url = "http://export.arxiv.org/api/query"
            params = {
                'search_query': f'all:{query}',
                'start': 0,
                'max_results': limit
            }
            
            response = requests.get(url, params=params, timeout=30)
            response.raise_for_status()
            
            root = ET.fromstring(response.content)
            namespace = {'atom': 'http://www.w3.org/2005/Atom'}
            
            papers = []
            for entry in root.findall('atom:entry', namespace):
                title = entry.find('atom:title', namespace)
                summary = entry.find('atom:summary', namespace)
                published = entry.find('atom:published', namespace)
                
                authors = []
                for author in entry.findall('atom:author', namespace):
                    name = author.find('atom:name', namespace)
                    if name is not None:
                        authors.append(name.text)
                
                paper = {
                    'id': entry.find('atom:id', namespace).text if entry.find('atom:id', namespace) is not None else '',
                    'title': title.text if title is not None else 'No title',
                    'authors': authors,
                    'abstract': summary.text if summary is not None else 'No abstract',
                    'year': published.text[:4] if published is not None else '',
                    'journal': 'arXiv',
                    'url': entry.find('atom:id', namespace).text if entry.find('atom:id', namespace) is not None else '',
                    'citations': 0,
                    'source': 'arxiv'
                }
                papers.append(paper)
            
            return {
                'success': True,
                'source': 'arxiv',
                'count': len(papers),
                'papers': papers
            }
            
        except Exception as e:
            raise Exception(f"arXiv search failed: {str(e)}")
    
    def _get_abstract_from_inverted(self, inverted_index: Dict) -> str:
        """Convert OpenAlex inverted index to readable abstract"""
        if not inverted_index:
            return "No abstract available"
        
        try:
            words = {}
            for word, positions in inverted_index.items():
                for pos in positions:
                    words[pos] = word
            
            sorted_positions = sorted(words.keys())
            return ' '.join(words[pos] for pos in sorted_positions)
        except:
            return "Abstract processing failed"
    
    def _cache_result(self, key: str, result: Dict[str, Any]):
        """Cache search result"""
        self.cache[key] = {
            'data': result,
            'timestamp': time.time()
        }

# Initialize service
search_service = PaperSearchService()

@app.route('/api/search/papers', methods=['GET'])
def search_papers():
    """Enhanced paper search endpoint"""
    query = request.args.get('query')
    limit = min(int(request.args.get('limit', 10)), 50)  # Cap at 50
    
    if not query or len(query.strip()) < 3:
        return jsonify({
            'success': False,
            'error': 'Query must be at least 3 characters long',
            'papers': []
        }), 400
    
    try:
        result = search_service.search_papers(query.strip(), limit)
        
        if result['success']:
            return jsonify(result), 200
        else:
            return jsonify(result), 500
            
    except Exception as e:
        logger.error(f"Search error: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'papers': []
        }), 500

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'timestamp': time.time()
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
