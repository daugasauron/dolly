extern crate proc_macro;
use proc_macro::TokenStream;

#[proc_macro]
pub fn answer(_: TokenStream) -> TokenStream {
    let output = std::process::Command::new("/bin/slop")
        .args(["-c", "printf 42"])
        .output()
        .unwrap();
    assert!(output.status.success());
    assert_eq!(output.stdout, b"42");
    assert!(output.stderr.is_empty());
    "42u32".parse().unwrap()
}
