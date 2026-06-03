import urllib.request
import json
url = 'https://qeftlgnytjoejwxqzdyh.supabase.co/rest/v1/vege_bento_orders?select=*&limit=5'
headers = {
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFlZnRsZ255dGpvZWp3eHF6ZHloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwMzkyMTcsImV4cCI6MjA5NTYxNTIxN30.7LSpILxjFJIzkYrhsBmuDZfQhkxk268q2HAvbCpHO7E',
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFlZnRsZ255dGpvZWp3eHF6ZHloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwMzkyMTcsImV4cCI6MjA5NTYxNTIxN30.7LSpILxjFJIzkYrhsBmuDZfQhkxk268q2HAvbCpHO7E',
    'Accept': 'application/json'
}
req = urllib.request.Request(url, headers=headers)
with urllib.request.urlopen(req, timeout=20) as resp:
    print(resp.read().decode('utf-8'))
