package v1

import (
	"bytes"
	"crypto/sha1"
	"image"
	"image/color"
	"image/draw"
	_ "image/gif"
	"image/png"
	"net/url"
	"strings"

	"github.com/disintegration/imaging"
	"github.com/pkg/errors"
	"golang.org/x/image/font"
	"golang.org/x/image/font/gofont/goregular"
	"golang.org/x/image/font/opentype"
	"golang.org/x/image/math/fixed"
)

const (
	fallbackCoverWidth  = 1200
	fallbackCoverHeight = 630
)

var pngSignature = []byte("\x89PNG\r\n\x1a\n")

// generateLinkFallbackCover creates a deterministic local cover when a page
// provides no usable preview image. The favicon is optional.
func generateLinkFallbackCover(pageURL string, favicon []byte) ([]byte, error) {
	parsedURL, err := url.Parse(pageURL)
	if err != nil {
		return nil, errors.Wrap(err, "parse fallback cover URL")
	}
	host := strings.TrimPrefix(parsedURL.Hostname(), "www.")
	seed := sha1.Sum([]byte(host))
	background := color.RGBA{R: 230 + seed[0]%14, G: 229 + seed[1]%14, B: 226 + seed[2]%14, A: 255}
	ink := color.RGBA{R: 35 + seed[2]%18, G: 39 + seed[0]%18, B: 45 + seed[1]%18, A: 255}

	cover := image.NewRGBA(image.Rect(0, 0, fallbackCoverWidth, fallbackCoverHeight))
	draw.Draw(cover, cover.Bounds(), image.NewUniform(background), image.Point{}, draw.Src)

	fontData, err := opentype.Parse(goregular.TTF)
	if err != nil {
		return nil, errors.Wrap(err, "parse fallback cover font")
	}
	domainFace, err := opentype.NewFace(fontData, &opentype.FaceOptions{Size: 30, DPI: 72, Hinting: font.HintingFull})
	if err != nil {
		return nil, errors.Wrap(err, "create fallback cover domain font")
	}
	defer domainFace.Close()

	initial := "?"
	if host != "" {
		initial = strings.ToUpper(string([]rune(host)[0]))
	}

	iconRect := image.Rect(548, 220, 652, 324)
	draw.Draw(cover, iconRect, image.NewUniform(color.RGBA{R: 250, G: 250, B: 249, A: 255}), image.Point{}, draw.Src)
	if icon, decodeErr := decodeFavicon(favicon); decodeErr == nil {
		resized := imaging.Fit(icon, 72, 72, imaging.Lanczos)
		position := image.Pt(iconRect.Min.X+(iconRect.Dx()-resized.Bounds().Dx())/2, iconRect.Min.Y+(iconRect.Dy()-resized.Bounds().Dy())/2)
		draw.Draw(cover, resized.Bounds().Add(position), resized, resized.Bounds().Min, draw.Over)
	} else {
		drawCenteredText(cover, domainFace, initial, fallbackCoverWidth/2, 287, ink)
	}

	drawCenteredText(cover, domainFace, truncateCoverText(domainFace, host, 520), fallbackCoverWidth/2, 380, ink)

	var output bytes.Buffer
	if err := png.Encode(&output, cover); err != nil {
		return nil, errors.Wrap(err, "encode fallback cover")
	}
	return output.Bytes(), nil
}

func decodeFavicon(blob []byte) (image.Image, error) {
	icon, _, err := image.Decode(bytes.NewReader(blob))
	if err == nil {
		return icon, nil
	}
	// Modern ICO files commonly wrap a PNG payload. Supporting that path keeps
	// the fallback lightweight without pulling in an ICO decoder.
	if offset := bytes.Index(blob, pngSignature); offset >= 0 {
		icon, _, err = image.Decode(bytes.NewReader(blob[offset:]))
	}
	return icon, err
}

func drawText(destination draw.Image, face font.Face, text string, x, baseline int, ink color.Color) {
	drawer := font.Drawer{Dst: destination, Src: image.NewUniform(ink), Face: face, Dot: fixedPoint(x, baseline)}
	drawer.DrawString(text)
}

func drawCenteredText(destination draw.Image, face font.Face, text string, centerX, baseline int, ink color.Color) {
	drawText(destination, face, text, centerX-font.MeasureString(face, text).Ceil()/2, baseline, ink)
}

func fixedPoint(x, y int) fixed.Point26_6 {
	return fixed.P(x, y)
}

func truncateCoverText(face font.Face, text string, maxWidth int) string {
	if font.MeasureString(face, text).Ceil() <= maxWidth {
		return text
	}
	runes := []rune(text)
	for len(runes) > 0 && font.MeasureString(face, string(runes)+"…").Ceil() > maxWidth {
		runes = runes[:len(runes)-1]
	}
	return string(runes) + "…"
}
