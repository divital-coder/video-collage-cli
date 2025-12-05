.PHONY: readme clean help

help:
	@echo "Available commands:"
	@echo "  make readme  - Generate README SVG frames (requires typst)"
	@echo "  make clean   - Remove generated assets"
	@echo "  make help    - Show this help"

readme:
	@echo "Generating light theme frames..."
	typst compile -f svg README.typ assets/frame-{p}.svg
	@echo "Generating dark theme frames..."
	typst compile -f svg --input theme=dark README.typ assets/frame-dark-{p}.svg
	@echo "Done! Generated frames in assets/"

clean:
	rm -f assets/frame-*.svg
	@echo "Cleaned generated assets"
