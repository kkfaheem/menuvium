import asyncio
from sqlmodel import select, Session
from database import engine
from models import Menu
from routers.export import export_menu
import zipfile

def test():
    with Session(engine) as session:
        menu = session.exec(select(Menu).order_by(Menu.created_at.desc())).first()
        if not menu:
            print("No menu")
            return
            
        print(f"Menu name: {menu.name}")
        print(f"Config before export: {menu.title_design_config}")
        
        # Test how export would process it:
        menu_title_design_config = None
        menu_logos_filenames = []
        
        if menu.title_design_config:
            menu_title_design_config = menu.title_design_config.copy() if isinstance(menu.title_design_config, dict) else menu.title_design_config
            if isinstance(menu_title_design_config, dict):
                logos = menu_title_design_config.get("logos", [])
                for idx, url in enumerate(logos):
                    if not url:
                        menu_logos_filenames.append(None)
                        continue
                    logo_fn = f"images/config_logo_{idx}.jpg"
                    menu_logos_filenames.append(logo_fn)
                    
        print(f"Filenames: {menu_logos_filenames}")

test()
