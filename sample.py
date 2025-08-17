def calculate_total(items):
    return sum(item['price'] for item in items if item['price'] > 0)

def get_user_name(user):
    return user.get('name', 'Unknown') if user else 'Unknown'
