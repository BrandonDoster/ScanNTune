using Avalonia.Controls;
using Avalonia.Markup.Xaml;

namespace ScanNTune.App.Controls;

public partial class CouponGlyph : UserControl
{
    public CouponGlyph()
    {
        InitializeComponent();
    }

    private void InitializeComponent() => AvaloniaXamlLoader.Load(this);
}
